/**
 * N-ATLAS writes the build guide's words.
 *
 * The engine (generate.ts) decides the facts and structure — kind of app,
 * architecture, data sources, licence, starter code. N-ATLAS then writes the
 * parts a developer reads — what the app is, how it helps, an example
 * conversation, the first version, each feature, mistakes to avoid — in the
 * project's language, from those facts only.
 *
 * Every section is checked before it replaces the engine's text: right
 * language, sensible length, no repetition loops, no numbers or model names
 * the facts don't contain. A section that fails keeps the engine's text.
 */

import { detectLanguage, findRepetition, LANG_NAMES, type LangCode } from "../eval/lang.js";
import { NATLAS_FACTS } from "./buildPlan.js";
import type { Blueprint } from "./types.js";

export const SECTIONS = ["purpose", "summary", "conversation", "mvp", "features", "pitfalls"] as const;
export type SectionId = (typeof SECTIONS)[number];

export type SectionValue = string | string[] | { user: string; app: string } | { task: string; how: string }[];

export interface SectionPrompt {
  system: string;
  prompt: string;
  maxTokens: number;
}

/** Everything N-ATLAS may rely on: the engine's facts about this app and about itself. */
export function factsFor(bp: Blueprint): string {
  const plan = bp.buildPlan;
  return [
    `App name: ${bp.name}`,
    `What it does: ${bp.purpose}`,
    `For: ${bp.targetUsers}`,
    plan && `Kind of app: ${plan.useCase.label} — ${plan.useCase.summary}`,
    `Main tasks: ${bp.primaryTasks.join("; ")}`,
    plan && `Where people use it: ${plan.channel.label}`,
    plan?.dataSources.length && `Facts it needs from you: ${plan.dataSources.map((d) => d.name).join("; ")}`,
    `Languages: ${bp.languages.join(", ")}`,
    `N-ATLAS: an open ${NATLAS_FACTS.base} model for ${NATLAS_FACTS.officialLanguages.join(", ")}; ` +
      `${NATLAS_FACTS.contextTokens.toLocaleString("en-US")}-token context; licence allows ${NATLAS_FACTS.license.userCap}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function systemFor(language: LangCode): string {
  const name = LANG_NAMES[language];
  return (
    "You are N-ATLAS, writing part of the build guide for a developer's app in N-ATLAS Launchpad. " +
    `Write in ${language === "en" ? "clear Nigerian English" : `natural, everyday ${name}`}. ` +
    "Use only the facts you are given: do not invent prices, laws, statistics, dates, partners or features. " +
    "Keep product names (N-ATLAS, WhatsApp, Telegram) and technical words (API, JSON, SMS, USSD) as they are. " +
    "No preamble, no headings, no notes about what you are doing." +
    (language === "yo" ? " Write Yoruba with full tone marks." : "") +
    (language === "ig" ? " Write Igbo with its dotted vowels (ị, ọ, ụ)." : "") +
    (language === "ha" ? " Write Hausa with its hooked letters (ɓ, ɗ, ƙ) where they belong." : "")
  );
}

/** The prompt for one section, built from the blueprint's facts and the engine's own text as a starting point. */
export function sectionPrompt(section: SectionId, bp: Blueprint, language: LangCode): SectionPrompt {
  const plan = bp.buildPlan;
  const facts = `Facts about the app:\n${factsFor(bp)}\n\n`;
  const lang = language === "en" ? "English" : LANG_NAMES[language];
  const system = systemFor(language);
  switch (section) {
    case "purpose":
      return {
        system,
        maxTokens: 90,
        prompt: facts + `In one sentence of ${lang}, say what ${bp.name} does and who it is for.`,
      };
    case "summary":
      return {
        system,
        maxTokens: 170,
        prompt:
          facts +
          `In two or three short sentences of ${lang}, explain how ${bp.name} helps the people who use it. ` +
          `Starting point, to adapt to this app: "${plan.useCase.summary}"`,
      };
    case "conversation":
      return {
        system,
        maxTokens: 220,
        prompt:
          facts +
          `Write a short example of ${bp.name} in use, in ${lang}: one message a real user would send, then the app's reply ` +
          "(two sentences at most). Where the reply needs facts from the app's own data, write … instead of making them up. " +
          "Use exactly this format, keeping the labels User: and App: in English:\nUser: <message>\nApp: <reply>",
      };
    case "mvp":
      return {
        system,
        maxTokens: 420,
        prompt:
          facts +
          `List 3 to 5 things the first version of ${bp.name} should do, in ${lang}, one per line starting with "- ". ` +
          `Starting point:\n${plan.mvp.map((m) => `- ${m}`).join("\n")}`,
      };
    case "features":
      // Written one feature at a time (featurePrompt): an 8B model loses count in one long list.
      return featurePrompt(bp, 0, language);
    case "pitfalls":
      return {
        system,
        maxTokens: 420,
        prompt:
          facts +
          `List 3 or 4 mistakes to avoid when building ${bp.name}, in ${lang}, one per line starting with "- ". ` +
          `Starting point:\n${plan.pitfalls.map((p) => `- ${p}`).join("\n")}`,
      };
  }
}

/** One feature, explained in the project's language. */
export function featurePrompt(bp: Blueprint, index: number, language: LangCode): SectionPrompt {
  const f = bp.buildPlan.features[index];
  const lang = language === "en" ? "English" : LANG_NAMES[language];
  return {
    system: systemFor(language),
    maxTokens: 160,
    prompt:
      `Facts about the app:\n${factsFor(bp)}\n\n` +
      `Feature of ${bp.name}: ${f.task}\nTechnique: ${f.approachLabel}\nNotes: ${f.how}\n\n` +
      `In ${lang}, give the feature's name, then a colon, then one or two plain sentences on how ${bp.name} should do it. ` +
      "Reply on one line: <feature name>: <explanation>",
  };
}

/** "<name>: <explanation>" → the feature, or undefined if it isn't in that shape. */
export function parseFeature(text: string, truncated = false): { task: string; how: string } | undefined {
  const line = text.trim().split("\n").find((l) => l.includes(":"));
  const m = line?.match(/^\s*(?:\d+[.)]\s*)?(.+?)\s*[:：]\s+(.+)$/);
  if (!m) return undefined;
  const how = truncated ? toLastSentence(clean(m[2])) : clean(m[2]);
  return how && clean(m[1]).length <= 120 ? { task: clean(m[1]), how } : undefined;
}

/** Text cut off by the token limit, trimmed back to its last full sentence ("" if there isn't one). */
function toLastSentence(text: string): string {
  const m = text.match(/^[\s\S]*[.!?…](?=\s|$)/);
  return m ? m[0].trim() : "";
}

const clean = (s: string) => s.replace(/^\s*["“”']+|["“”']+\s*$/g, "").replace(/\*\*/g, "").trim();

function bullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.+)$/)?.[1])
    .filter((l): l is string => !!l && l.trim().length > 3)
    .map(clean);
}

/** Turn N-ATLAS's text into the section's value, or say why it can't be used. */
export function parseSection(
  section: SectionId,
  text: string,
  bp: Blueprint,
  /** The reply hit its token limit, so its last part is cut off. */
  truncated = false,
): { value?: SectionValue; problem?: string } {
  const t = text.trim();
  if (!t) return { problem: "empty" };
  const whole = (s: string) => (truncated ? toLastSentence(s) : s);
  switch (section) {
    case "purpose": {
      const value = whole(clean(t.split(/\n\s*\n/)[0]));
      return value.length < 15 ? { problem: truncated ? "cut off" : "too short" } : value.length > 350 ? { problem: "too long" } : { value };
    }
    case "summary": {
      const value = whole(clean(t.split(/\n\s*\n/).slice(0, 2).join(" ")));
      return value.length < 30 ? { problem: truncated ? "cut off" : "too short" } : value.length > 700 ? { problem: "too long" } : { value };
    }
    case "conversation": {
      const m = t.match(/User\s*:\s*([\s\S]+?)\n+\s*App\s*:\s*([\s\S]+)/i);
      if (!m) return { problem: "not in the User:/App: format" };
      const user = clean(m[1]);
      const app = whole(clean(m[2].split(/\n\s*\n/)[0]));
      return user && app ? { value: { user, app } } : { problem: truncated ? "cut off" : "missing a message" };
    }
    case "mvp":
    case "pitfalls": {
      let items = bullets(t);
      // The last item was cut off mid-way by the token limit.
      if (truncated && items.length > 2) items = items.slice(0, -1);
      return items.length < 2 ? { problem: "not a list" } : { value: items.slice(0, 6) };
    }
    case "features": {
      // Features arrive one per line, "<name>: <explanation>" (see the route, which asks for each separately).
      const n = bp.buildPlan.features.length;
      const rows = t
        .split("\n")
        .map((l) => parseFeature(l))
        .filter((r): r is { task: string; how: string } => !!r);
      return rows.length !== n ? { problem: `expected ${n} features, got ${rows.length}` } : { value: rows };
    }
  }
}

/** All the text in a section value, for checking. */
export function sectionText(value: SectionValue): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : `${v.task}: ${v.how}`)).join("\n");
  return `${value.user}\n${value.app}`;
}

const OTHER_MODELS = /\b(chat\s?gpt|gpt-?\d|openai|gemini|claude|llama\s?2|mistral)\b/i;

/** Checks that keep N-ATLAS's text from replacing the engine's when it shouldn't. */
export function checkSection(value: SectionValue, bp: Blueprint, language: LangCode): string | null {
  const text = sectionText(value);
  const guess = detectLanguage(text);
  if (language === "en") {
    if (guess.lang !== "en" && guess.lang !== "pid" && guess.confidence > 0.5) return `written in ${LANG_NAMES[guess.lang]}, not English`;
  } else if (guess.lang !== language) {
    return `not written in ${LANG_NAMES[language]}`;
  }
  // Loops happen within one answer; across list items a shared phrase ("the app should…") is normal.
  const parts = Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v : `${v.task}: ${v.how}`)) : [text];
  for (const part of parts) {
    const loop = findRepetition(part, 3);
    if (loop.count >= 4) return `repeats “${loop.phrase}”`;
  }
  if (OTHER_MODELS.test(text) && !OTHER_MODELS.test(factsFor(bp))) return "mentions another AI model";
  // Numbers of 3+ digits (prices, years, limits) must come from the facts.
  const known = (factsFor(bp) + JSON.stringify(bp.buildPlan)).replace(/[,\s]/g, "");
  for (const n of text.match(/\d[\d,.]{2,}\d/g) ?? []) {
    if (!known.includes(n.replace(/[,\s]/g, ""))) return `mentions ${n}, which isn't in the facts`;
  }
  return null;
}
