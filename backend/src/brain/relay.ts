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
export function protectCode(text: string) {
  const parts: string[] = [];
  const masked = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
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
  const masked = opts.protectCode ? protectCode(thought.text) : null;
  const source = masked ? masked.text : thought.text;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) onEvent({ type: "reset" });
    else onEvent({ type: "voice", voice: "N-ATLAS" });
    const said = await natlasText(
      natlas,
      translateSystem(name),
      `Translate into ${name}:\n${source}`,
      Math.min(1200, Math.ceil(source.length / 1.5) + 80),
      masked ? null : (d) => onEvent({ type: "delta", delta: d }),
      signal,
    );
    const words = said.replace(/\[\[C\d+\]\]/g, "");
    if (said && inLanguage(words, language) && keepsNumbers(source, said) && (!masked || masked.complete(said))) {
      const text = masked ? masked.restore(said) : said;
      if (masked) onEvent({ type: "delta", delta: text });
      return { text, english: thought.text, brain: thought.provider, voice: "N-ATLAS" };
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
    { maxTokens: opts.maxTokens ?? 600, signal },
  );
  onEvent({ type: "delta", delta: direct.text });
  return { text: direct.text, english: thought.text, brain: thought.provider, voice: direct.provider };
}
