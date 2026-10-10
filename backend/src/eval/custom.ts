/**
 * Developer-supplied test cases (saved from the Playground or imported from a
 * suite file) and helpers for assembling a run.
 *
 * Input arrives from the browser, so it is validated defensively: unknown
 * check types are dropped rather than trusted.
 */

import { CHECK_TYPES, type Check, type JsonType, type Lang, type TestCase } from "./types.js";

const LANGS: Lang[] = ["en", "pid", "yo", "ha", "ig"];
const MAX_CUSTOM_CASES = 200;

function str(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : undefined;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, 500)).filter((x): x is string => !!x) : [];
}

function parseCheck(raw: any): Check | null {
  if (!raw || !CHECK_TYPES.includes(raw.type)) return null;
  const label = str(raw.label, 200);
  switch (raw.type as Check["type"]) {
    case "containsAny":
    case "containsAll":
    case "notContains": {
      const values = strList(raw.values);
      return values.length ? { type: raw.type, values, label } : null;
    }
    case "regex": {
      const pattern = str(raw.pattern, 500);
      return pattern ? { type: "regex", pattern, flags: str(raw.flags, 8), label } : null;
    }
    case "minLength":
      return Number.isFinite(raw.chars) ? { type: "minLength", chars: Math.max(0, raw.chars), label } : null;
    case "maxLength":
      return Number.isFinite(raw.chars) && raw.chars > 0 ? { type: "maxLength", chars: raw.chars, label } : null;
    case "refusal":
      return { type: "refusal", expected: raw.expected !== false, label };
    case "language":
      return LANGS.includes(raw.lang) ? { type: "language", lang: raw.lang, label } : null;
    case "noRepetition":
      return {
        type: "noRepetition",
        maxRepeats: Number.isFinite(raw.maxRepeats) ? raw.maxRepeats : undefined,
        label,
      };
    case "maxLatency":
      return Number.isFinite(raw.ms) && raw.ms > 0 ? { type: "maxLatency", ms: raw.ms, label } : null;
    case "jsonShape": {
      if (!raw.schema || typeof raw.schema !== "object") return null;
      const schema: Record<string, JsonType> = {};
      for (const [k, v] of Object.entries(raw.schema).slice(0, 30)) {
        if (typeof v === "string" && JSON_TYPES.includes(v as JsonType)) schema[k.slice(0, 60)] = v as JsonType;
      }
      return Object.keys(schema).length ? { type: "jsonShape", schema, label } : null;
    }
  }
}

const JSON_TYPES: JsonType[] = ["string", "number", "boolean", "array", "object"];

/** Validate browser-supplied cases into runnable TestCases (category "custom"). */
export function parseCustomCases(input: unknown): TestCase[] {
  if (!Array.isArray(input)) return [];
  const out: TestCase[] = [];
  for (const [i, raw] of input.slice(0, MAX_CUSTOM_CASES).entries()) {
    const prompt = str(raw?.prompt);
    if (!prompt) continue;
    const checks = (Array.isArray(raw.checks) ? raw.checks : [])
      .map(parseCheck)
      .filter((c: Check | null): c is Check => c !== null);
    // A case with no checks can't pass or fail meaningfully; give it the
    // universal sanity checks.
    if (checks.length === 0) checks.push({ type: "minLength", chars: 1 }, { type: "noRepetition" });
    out.push({
      id: str(raw.id, 80) ?? `custom-${i + 1}`,
      category: "custom",
      description: str(raw.description, 300) ?? "Your test case",
      prompt,
      language: LANGS.includes(raw.language) ? raw.language : undefined,
      context: str(raw.context, 8000),
      checks,
    });
  }
  return out;
}

/**
 * Pick a small, representative sample: round-robin across categories so a
 * quick run still touches every area (custom cases first).
 */
export function sampleAcrossCategories(cases: TestCase[], n: number): TestCase[] {
  const byCat = new Map<string, TestCase[]>();
  for (const c of cases) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }
  const queues = [...byCat.values()];
  const out: TestCase[] = [];
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return out;
}
