/**
 * Helpers for the developer's own test cases: human labels for checks,
 * sensible default checks, and conversion to/from the runner and suite files.
 */

import type { Check, CustomCaseInput, LangCode } from "../api";
import type { SavedTestCase } from "../state/ProjectContext";

export const LANG_LABEL: Record<LangCode, string> = {
  en: "Nigerian English",
  pid: "Nigerian Pidgin",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
};

/** Check types a developer can add from the UI, with a short explanation. */
export const CHECK_KINDS: { type: Check["type"]; label: string; hint: string; needs?: "values" | "lang" | "number" | "pattern" }[] = [
  { type: "language", label: "Reply language is…", hint: "Fails if the model answers in the wrong language", needs: "lang" },
  { type: "noRepetition", label: "No repetition loop", hint: "Fails on looping output like “kaifi ne, kaifi ne…”" },
  { type: "containsAny", label: "Mentions any of…", hint: "Comma-separated; accents and case are ignored", needs: "values" },
  { type: "containsAll", label: "Mentions all of…", hint: "Comma-separated; accents and case are ignored", needs: "values" },
  { type: "notContains", label: "Must NOT mention…", hint: "Comma-separated forbidden words or phrases", needs: "values" },
  { type: "refusal", label: "Refuses the request", hint: "For harmful or out-of-scope prompts" },
  { type: "maxLatency", label: "Responds within (seconds)…", hint: "Fails if the reply is slower", needs: "number" },
  { type: "minLength", label: "At least N characters", hint: "Catches empty or one-word replies", needs: "number" },
  { type: "maxLength", label: "At most N characters", hint: "Keeps replies short — e.g. 160 for one SMS", needs: "number" },
  { type: "regex", label: "Matches regex…", hint: "JavaScript regular expression, case-insensitive", needs: "pattern" },
];

export function checkLabel(c: Check): string {
  switch (c.type) {
    case "language":
      return `Reply in ${LANG_LABEL[c.lang] ?? c.lang}`;
    case "noRepetition":
      return "No repetition loop";
    case "containsAny":
      return `Mentions any of: ${c.values.join(", ")}`;
    case "containsAll":
      return `Mentions all of: ${c.values.join(", ")}`;
    case "notContains":
      return `Must not mention: ${c.values.join(", ")}`;
    case "refusal":
      return c.expected ? "Refuses the request" : "Does not refuse";
    case "maxLatency":
      return `Responds within ${c.ms / 1000}s`;
    case "minLength":
      return `At least ${c.chars} characters`;
    case "maxLength":
      return `At most ${c.chars} characters`;
    case "regex":
      return `Matches /${c.pattern}/${c.flags ?? ""}`;
    case "jsonShape":
      return `Valid JSON with ${Object.keys(c.schema).join(", ")}`;
  }
}

/** Build a check from the add-check form. Returns null if the input is incomplete. */
export function buildCheck(type: Check["type"], raw: string, lang: LangCode): Check | null {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const num = Number(raw);
  switch (type) {
    case "language":
      return { type, lang };
    case "noRepetition":
      return { type };
    case "refusal":
      return { type, expected: true };
    case "containsAny":
    case "containsAll":
    case "notContains":
      return values.length ? { type, values } : null;
    case "maxLatency":
      return num > 0 ? { type, ms: Math.round(num * 1000) } : null;
    case "minLength":
    case "maxLength":
      return num > 0 ? { type, chars: Math.round(num) } : null;
    case "jsonShape":
      return null; // created from a JSON task template, not the add-check form
    case "regex":
      try {
        new RegExp(raw);
      } catch {
        return null;
      }
      return raw.trim() ? { type, pattern: raw.trim(), flags: "i" } : null;
  }
}

/** Default checks for a case saved from the Playground. */
export function suggestChecks(tc: Pick<SavedTestCase, "language" | "verdict">): Check[] {
  const checks: Check[] = [];
  if (tc.language in LANG_LABEL) checks.push({ type: "language", lang: tc.language as LangCode });
  checks.push({ type: "noRepetition" });
  return checks;
}

export function checksFor(tc: SavedTestCase): Check[] {
  return tc.checks ?? suggestChecks(tc);
}

/** Shape sent to the backend runner. */
export function toCaseInput(tc: SavedTestCase): CustomCaseInput {
  return {
    id: tc.id,
    prompt: tc.userMessage,
    language: tc.language,
    description: tc.note || tc.expectedBehavior || "Saved from the Playground",
    context: tc.context,
    checks: checksFor(tc),
  };
}

// ── Suite files ──────────────────────────────────────────────────────────────

export const SUITE_FORMAT = "natlas-launchpad/test-suite@1";

export interface SuiteFile {
  format: typeof SUITE_FORMAT;
  name: string;
  exportedAt: string;
  systemPrompt?: string;
  tests: Array<{
    id: string;
    prompt: string;
    language?: string;
    description?: string;
    expected?: string;
    /** Facts added to the system prompt for this test. */
    context?: string;
    lastReply?: string;
    verdict?: "good" | "bad";
    checks: Check[];
  }>;
}

export function toSuiteFile(name: string, cases: SavedTestCase[], systemPrompt?: string): SuiteFile {
  return {
    format: SUITE_FORMAT,
    name,
    exportedAt: new Date().toISOString(),
    systemPrompt,
    tests: cases.map((tc) => ({
      id: tc.id,
      prompt: tc.userMessage,
      language: tc.language,
      description: tc.note || undefined,
      expected: tc.expectedBehavior || undefined,
      context: tc.context || undefined,
      lastReply: tc.assistantReply || undefined,
      verdict: tc.verdict,
      checks: checksFor(tc),
    })),
  };
}

/** Parse an imported suite file. Throws a readable error on bad input. */
export function fromSuiteFile(text: string): SavedTestCase[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  const tests = Array.isArray(data) ? data : data?.tests;
  if (!Array.isArray(tests)) throw new Error("Expected a test suite with a \"tests\" array.");
  const now = new Date().toISOString();
  return tests
    .filter((t: any) => typeof t?.prompt === "string" && t.prompt.trim())
    .map((t: any, i: number) => ({
      id: typeof t.id === "string" ? t.id : `imported-${Date.now()}-${i}`,
      userMessage: t.prompt,
      assistantReply: typeof t.lastReply === "string" ? t.lastReply : "",
      language: typeof t.language === "string" ? t.language : "en",
      verdict: t.verdict === "good" ? "good" : "bad",
      note: typeof t.description === "string" ? t.description : "",
      expectedBehavior: typeof t.expected === "string" ? t.expected : "",
      context: typeof t.context === "string" ? t.context : undefined,
      savedAt: now,
      checks: Array.isArray(t.checks) ? t.checks : undefined,
    }));
}

/** Same wording the backend and starter server use to add facts to the prompt. */
export function withContext(system: string, context: string): string {
  if (!context.trim()) return system;
  const facts = "Answer only from these facts. If they don't cover the question, say so:\n" + context.trim();
  return system ? `${system}\n\n${facts}` : facts;
}

/** Fill {{field}} placeholders in a task template. */
export function renderTemplate(prompt: string, values: Record<string, string>): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "");
}

// ── One-tap rating ───────────────────────────────────────────────────────────

export type BadReason = "language" | "made-up" | "repeated" | "too-long" | "unsafe" | "other";

/** Reasons offered after 👎 — each quietly becomes the right automatic check. */
export const BAD_REASONS: { id: BadReason; label: string }[] = [
  { id: "language", label: "Wrong language" },
  { id: "made-up", label: "Made things up" },
  { id: "repeated", label: "Repeated itself" },
  { id: "too-long", label: "Too long" },
  { id: "unsafe", label: "Shouldn't have answered" },
  { id: "other", label: "Something else" },
];

/**
 * Checks and an "expected" line for a rated reply. Some reasons can't be
 * checked automatically (e.g. made-up facts); those keep the default checks
 * and record what was expected so a person can review it.
 */
export function checksForRating(
  language: string,
  verdict: "good" | "bad",
  reason?: BadReason,
  replyLength = 0,
): { checks: Check[]; expected: string } {
  let checks = suggestChecks({ language, verdict });
  let expected = "";
  switch (reason) {
    case "language":
      expected = `Reply in ${LANG_LABEL[language as LangCode] ?? "the user's language"}`;
      break;
    case "made-up":
      expected = "Answer only from the facts given, and say when it doesn't know";
      break;
    case "repeated":
      checks = checks.map((c) => (c.type === "noRepetition" ? { type: "noRepetition", maxRepeats: 3 } : c));
      expected = "No repeated phrases";
      break;
    case "too-long": {
      const limit = Math.min(600, Math.max(80, Math.round(replyLength * 0.6)));
      checks = [...checks, { type: "maxLength", chars: limit }];
      expected = `A shorter reply (at most ${limit} characters)`;
      break;
    }
    case "unsafe":
      checks = [...checks, { type: "refusal", expected: true }];
      expected = "Politely refuse";
      break;
  }
  return { checks, expected };
}
