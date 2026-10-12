/**
 * The relay: N-ATLAS listens, the brain thinks, N-ATLAS speaks.
 *
 *   developer's words (Hausa) ─▶ N-ATLAS: English reading
 *                               ─▶ brain: reply in clear English (sees both the words and the reading)
 *                               ─▶ N-ATLAS: reply in Hausa (streamed)
 *
 * Checks on the way back: the reply must be in the right language and keep
 * every number from the brain's English. If N-ATLAS's version fails twice, the
 * brain writes the reply in the language itself, and the result says so.
 * English needs no translating: the brain's reply is used as it is.
 */

import { detectLanguage, LANG_NAMES, type LangCode } from "../eval/lang.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import type { Brain, BrainMessage } from "./brain.js";
import { logger } from "../logger.js";

export type RelayEvent =
  | { type: "understood"; english: string } // N-ATLAS's English reading of the developer's words
  | { type: "thought"; english: string; brain: string } // the brain's reply, in English
  | { type: "delta"; delta: string }
  | { type: "reset" } // discard the streamed text: it's being written again
  | { type: "voice"; voice: string }; // who wrote the words the developer reads

export interface RelayResult {
  /** What the developer reads. */
  text: string;
  /** The brain's reply in English. */
  english: string;
  brain: string;
  /** "N-ATLAS" when N-ATLAS wrote the developer's language, else the brain's name. */
  voice: string;
}

const NUMBERS = /\d[\d,.]*\d|\d/g;

/** Every number in the English must survive translation (separators ignored). */
export function keepsNumbers(english: string, translated: string): boolean {
  const norm = (s: string) => (s.match(NUMBERS) ?? []).map((n) => n.replace(/[,.]/g, ""));
  const have = new Set(norm(translated));
  return norm(english).every((n) => have.has(n));
}

/** Is the text in the language (short texts aren't judged: detection needs words to go on)? */
export function inLanguage(text: string, lang: LangCode): boolean {
  if (text.trim().split(/\s+/).length < 6) return true;
  const guess = detectLanguage(text).lang;
  if (lang === "en") return guess === "en" || guess === "pid";
  return guess === lang;
}

async function natlasText(
  natlas: NAtlasProvider,
  system: string,
  prompt: string,
  maxTokens: number,
  onDelta: ((d: string) => void) | null,
  signal?: AbortSignal,
): Promise<string> {
  let out = "";
  await natlas.generateStream(
    prompt,
    { system, maxTokens, temperature: 0.1 },
    (c) => {
      if (c.type !== "delta" || !c.delta) return;
      out += c.delta;
      onDelta?.(c.delta);
    },
    signal,
  );
  return out.trim().replace(/^(translation|answer)\s*:\s*/i, "").replace(/^["“]+|["”]+$/g, "").trim();
}

const translateSystem = (to: string) =>
  `You translate text into natural, everyday ${to}. Keep names, numbers, prices, product names, code, commands, file names ` +
  `and markers like [[C1]] exactly as they are. ` +
  `Reply with only the ${to} translation — no notes, no quotation marks.`;

/**
 * Swap code blocks and `inline code` for markers like [[C1]] so translation
 * can't touch commands, then put them back.
 */
export function protectCode(text: string, keep: string[] = []) {
  const parts: string[] = [];
  // Also names that must stay as they are (the app's name), longest first.
  const names = keep.filter((k) => k.trim().length > 1).sort((a, b) => b.length - a.length);
  const escaped = names.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(["```[\\s\\S]*?```", "`[^`\\n]+`", ...escaped].join("|"), "g");
  const masked = text.replace(pattern, (m) => {
    parts.push(m);
    return `[[C${parts.length}]]`;
  });
  return {
    text: masked,
    /** Every marker came back exactly once. */
    complete: (t: string) => parts.every((_, i) => t.split(`[[C${i + 1}]]`).length === 2),
    restore: (t: string) => parts.reduce((out, part, i) => out.replace(`[[C${i + 1}]]`, () => part), t),
  };
}

const MARKER = /\[\[C\d+\]\]/g;

/** Code-like words: SETTING_NAMES, web addresses, file.names, key=value. */
const CODE_LIKE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|https?:\/\/\S+|\b[\w-]+\.(?:js|py|json|yaml|yml|ts|env|com|app|io|run)\b|\b\w+\s*=\s*\S+/g;

/**
 * Did the translation make things up? An 8B model sometimes keeps going after
 * a line that ends in "add:", inventing settings or commands. Too long, or a
 * code-like word the original didn't have, means it did.
 */
export function invents(original: string, translated: string): boolean {
  if (translated.length > original.length * 2.2 + 30) return true;
  const known = new Set(original.match(CODE_LIKE) ?? []);
  return (translated.match(CODE_LIKE) ?? []).some((w) => !known.has(w));
}

/**
 * Measurements ("50kg", "2 litres") and naira amounts ("₦82,000"): a small
 * model may swap the unit ("fam 50"), reformat the number or spell it out.
 * They stay in the text to translate, and must come back exactly.
 */
const QUANTITY = /\b\d[\d,.]*\s?(?:kg|g|mg|tonnes?|tons?|l|litres?|liters?|ml|cl|km|m|cm|mm|ft|%)(?![\p{L}\d])|₦\s?\d[\d,.]*\d|₦\s?\d|\bN\d[\d,]*\d(?![\p{L}\d])/gu;

export function keepsQuantities(original: string, translated: string): boolean {
  const norm = (s: string) => s.replace(/[\s,]/g, "").toLowerCase();
  const have = norm(translated);
  return (original.match(QUANTITY) ?? []).every((q) => have.includes(norm(q)));
}

/** A line's markdown lead-in ("2. ", "- ", "### ") — kept out of translation. */
const LEAD = /^(\s*(?:\d+[.)]\s+|[-*•]\s+|#{1,4}\s+)?)/;

export interface PiecesResult {
  text: string;
  /** Lines N-ATLAS couldn't translate faithfully, done by the fallback instead. */
  helped: number;
  lines: number;
}

/**
 * Translate text with code in it line by line (in parallel), code, list
 * numbers and table rows kept out. Each line must keep its markers and
 * numbers; a failing line gets one more try, then the fallback (the brain)
 * translates that line alone. Null if the result isn't in the language.
 */
export async function translatePieces(
  natlas: NAtlasProvider,
  english: string,
  language: LangCode,
  signal?: AbortSignal,
  fallback?: (line: string) => Promise<string>,
  keep: string[] = [],
): Promise<PiecesResult | null> {
  const name = LANG_NAMES[language];
  const masked = protectCode(english, keep);
  const lines = masked.text.split("\n");
  let helped = 0;
  const one = async (line: string): Promise<string> => {
    // Tables, rules and lines without words stay as they are.
    if (/^\s*\|/.test(line) || !/\p{L}{2,}/u.test(line.replace(MARKER, ""))) return line;
    const lead = line.match(LEAD)![1];
    // Bold doesn't survive word-order changes: translate the plain words, and
    // bold the whole line again if it started bold (a step's title).
    const rawBody = line.slice(lead.length);
    const bold = rawBody.trimStart().startsWith("**");
    const body = rawBody.replace(/\*\*/g, "").replace(/(^|\s)\*(\S[^*\n]*?\S)\*(?=\s|[.,:;]|$)/g, "$1$2");
    const dress = (said: string) => lead + (bold ? `**${said.trim()}**` : said);
    const markers = body.match(MARKER) ?? [];
    const faithful = (said: string) =>
      !!said && markers.every((m) => said.split(m).length === 2) && keepsNumbers(body, said) && keepsQuantities(body, said) && !invents(body, said);
    for (let attempt = 0; attempt < 2; attempt++) {
      const said = (
        await natlasText(natlas, translateSystem(name), `Translate into ${name}:\n${body}`, Math.min(400, Math.ceil(body.length / 1.5) + 40), null, signal)
      ).replace(/\n+/g, " ");
      if (faithful(said)) return dress(said);
      logger.warn("N-ATLAS line failed its checks", { language, attempt, markers: markers.every((m) => said.split(m).length === 2), numbers: keepsNumbers(body, said) });
    }
    if (!fallback) throw new Error("no faithful translation");
    helped++;
    return dress((await fallback(body)).replace(/\n+/g, " "));
  };
  let out: string[];
  try {
    out = await Promise.all(lines.map(one));
  } catch {
    return null;
  }
  const joined = out.join("\n");
  if (!inLanguage(joined.replace(MARKER, ""), language)) {
    logger.warn("N-ATLAS translation isn't in the language", { language });
    return null;
  }
  return { text: masked.restore(joined), helped, lines: lines.filter((l) => /\p{L}{2,}/u.test(l.replace(MARKER, ""))).length };
}

/** N-ATLAS's English reading of the developer's words ("" when they're already English). */
export async function understand(natlas: NAtlasProvider, words: string, signal?: AbortSignal): Promise<string> {
  if (detectLanguage(words).lang === "en") return "";
  return natlasText(natlas, translateSystem("English"), `Translate into English:\n${words}`, 200, null, signal);
}

/**
 * Relay one turn. `messages` is what the brain is asked (system + conversation),
 * ending with the developer's latest words; `words` are those words as typed.
 */
export async function relay(opts: {
  brain: Brain;
  natlas: NAtlasProvider;
  language: LangCode;
  messages: BrainMessage[];
  words: string;
  onEvent: (e: RelayEvent) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  /** The reply holds commands or code: keep them out of the translation (it arrives in one piece, not streamed). */
  protectCode?: boolean;
  /** Names to keep exactly as they are when translating (with protectCode), e.g. the app's name. */
  keep?: string[];
}): Promise<RelayResult> {
  const { brain, natlas, language, onEvent, signal } = opts;
  const name = LANG_NAMES[language];

  // 1. N-ATLAS listens: its English reading goes to the brain alongside the exact words.
  const reading = opts.words ? await understand(natlas, opts.words, signal) : "";
  if (reading) onEvent({ type: "understood", english: reading });
  const messages = [...opts.messages];
  const last = messages[messages.length - 1];
  if (reading && last?.role === "user") {
    messages[messages.length - 1] = {
      role: "user",
      content: `${last.content}\n\n(The developer's latest words, as written: "${opts.words}". N-ATLAS read them as: "${reading}". If the two disagree, trust the words as written.)`,
    };
  }

  // 2. The brain thinks, in English.
  // One system message: some OpenAI-compatible APIs (Gemini's) keep only the last one.
  const howToReply =
    language === "en"
      ? "Reply in clear English."
      : `Reply in clear, simple English: N-ATLAS will translate your reply into ${name} for the developer. Keep names, numbers and prices exact.`;
  const [first, ...rest] = messages;
  const thought = await brain.chat(
    first?.role === "system"
      ? [{ role: "system", content: `${first.content}\n\n${howToReply}` }, ...rest]
      : [{ role: "system", content: howToReply }, ...messages],
    { maxTokens: opts.maxTokens ?? 400, signal },
  );
  onEvent({ type: "thought", english: thought.text, brain: thought.provider });

  if (language === "en") {
    onEvent({ type: "voice", voice: thought.provider });
    onEvent({ type: "delta", delta: thought.text });
    return { text: thought.text, english: thought.text, brain: thought.provider, voice: thought.provider };
  }

  // 3. N-ATLAS speaks: translate, check, retry once.
  onEvent({ type: "voice", voice: "N-ATLAS" });
  if (opts.protectCode) {
    // Step-by-step answers with commands: paragraph by paragraph, all at once —
    // an 8B model stays faithful on short pieces, and the server runs them together.
    // A line N-ATLAS can't keep faithful (a number, a command) goes to the brain on its own.
    const lineByBrain = async (line: string) =>
      (
        await brain.chat(
          [
            { role: "system", content: translateSystem(name) },
            { role: "user", content: `Translate into ${name}:\n${line}` },
          ],
          { maxTokens: 300, signal, nigerian: true },
        )
      ).text;
    const done = await translatePieces(natlas, thought.text, language, signal, lineByBrain, opts.keep);
    // Mostly N-ATLAS's words: say so; if the brain had to write a third or more, say that instead.
    if (done && done.helped * 3 < Math.max(1, done.lines)) {
      onEvent({ type: "delta", delta: done.text });
      return { text: done.text, english: thought.text, brain: thought.provider, voice: "N-ATLAS" };
    }
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) onEvent({ type: "reset" });
      const said = await natlasText(
        natlas,
        translateSystem(name),
        `Translate into ${name}:\n${thought.text}`,
        Math.min(900, Math.ceil(thought.text.length / 1.5) + 80),
        (d) => onEvent({ type: "delta", delta: d }),
        signal,
      );
      if (said && inLanguage(said, language) && keepsNumbers(thought.text, said)) {
        return { text: said, english: thought.text, brain: thought.provider, voice: "N-ATLAS" };
      }
      logger.warn("N-ATLAS translation failed its checks", { language, attempt, inLanguage: inLanguage(said, language), numbers: keepsNumbers(thought.text, said) });
    }
  }

  // 4. N-ATLAS's version didn't hold up: the brain writes it in the language itself.
  onEvent({ type: "reset" });
  onEvent({ type: "voice", voice: thought.provider });
  const direct = await brain.chat(
    [
      { role: "system", content: translateSystem(name) },
      { role: "user", content: `Translate into ${name}:\n${thought.text}` },
    ],
    { maxTokens: opts.maxTokens ?? 600, signal, nigerian: true },
  );
  onEvent({ type: "delta", delta: direct.text });
  return { text: direct.text, english: thought.text, brain: thought.provider, voice: direct.provider };
}

/**
 * Text the brain wrote in English, said in the developer's language — not
 * streamed. N-ATLAS translates line by line (the brain helps with lines it
 * can't keep faithful); if that doesn't hold up, the brain translates it all.
 * English is returned as it is. `voice` says who wrote the words shown.
 */
export async function speakIn(opts: {
  brain: Brain;
  natlas: NAtlasProvider;
  language: LangCode;
  english: string;
  brainName: string;
  keep?: string[];
  signal?: AbortSignal;
}): Promise<{ text: string; voice: string }> {
  const { brain, natlas, language, english, brainName, keep, signal } = opts;
  if (language === "en") return { text: english, voice: brainName };
  const name = LANG_NAMES[language];
  const byBrain = async (text: string, maxTokens: number) =>
    (
      await brain.chat(
        [
          { role: "system", content: translateSystem(name) },
          { role: "user", content: `Translate into ${name}:\n${text}` },
        ],
        { maxTokens, signal, nigerian: true },
      )
    ).text;
  const done = await translatePieces(natlas, english, language, signal, (line) => byBrain(line, 300), keep);
  if (done && done.helped * 3 < Math.max(1, done.lines)) return { text: done.text, voice: "N-ATLAS" };
  return { text: await byBrain(english, 900), voice: brainName };
}
