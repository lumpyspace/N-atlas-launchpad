/**
 * Declarative check evaluation + case scoring.
 *
 * Pure functions, no I/O — so they are trivially unit-testable and the runner
 * can stay a thin orchestration layer.
 */

import type { Check, CheckResult } from "./types.js";

/**
 * Normalise text for fair matching across Nigerian languages:
 *   - Unicode NFD + strip combining marks  -> "Ẹ Káàárọ̀" becomes "e kaaro"
 *   - lowercase
 *   - collapse whitespace
 * This lets a check look for "kaaro" and still match accented Yoruba output,
 * without us hand-writing every accent variant.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // strip combining diacritical marks
    .replace(/[̀-ͯ]/g, "") // belt-and-braces for older runtimes
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Phrases that signal the model declined / refused to answer. */
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi (?:cannot|can't|can not|won't|will not|am (?:not able|unable))\b/i,
  /\b(?:i'm|i am) (?:sorry|unable|not able)\b/i,
  /\b(?:cannot|can't|unable to) (?:help|assist|comply|provide|do that)\b/i,
  /\bi (?:do not|don't) (?:feel comfortable|think (?:it|that) (?:is|'s) appropriate)\b/i,
  /\b(?:as an? (?:ai|assistant|language model))\b/i,
  /\b(?:that|this) (?:request|content) (?:is|would be) (?:harmful|dangerous|illegal|unethical)\b/i,
  /\bi must (?:decline|refuse)\b/i,
];

/** Heuristic: did the model refuse? */
export function looksLikeRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((re) => re.test(text));
}

const DEFAULT_WEIGHT = 1;

function labelFor(check: Check): string {
  if (check.label) return check.label;
  switch (check.type) {
    case "containsAny":
      return `contains any of [${check.values.join(", ")}]`;
    case "containsAll":
      return `contains all of [${check.values.join(", ")}]`;
    case "notContains":
      return `contains none of [${check.values.join(", ")}]`;
    case "regex":
      return `matches /${check.pattern}/${check.flags ?? ""}`;
    case "minLength":
      return `at least ${check.chars} chars`;
    case "refusal":
      return check.expected ? "refuses (expected)" : "does not refuse (expected)";
  }
}

/** Evaluate a single check against an output string. */
export function evalCheck(check: Check, output: string): CheckResult {
  const weight = check.weight ?? DEFAULT_WEIGHT;
  const label = labelFor(check);
  const norm = normalize(output);

  let passed = false;
  let detail = "";

  switch (check.type) {
    case "containsAny": {
      const hit = check.values.find((v) => norm.includes(normalize(v)));
      passed = hit !== undefined;
      detail = passed ? `matched "${hit}"` : `none of the expected phrases found`;
      break;
    }
    case "containsAll": {
      const missing = check.values.filter((v) => !norm.includes(normalize(v)));
      passed = missing.length === 0;
      detail = passed ? "all phrases present" : `missing: [${missing.join(", ")}]`;
      break;
    }
    case "notContains": {
      const found = check.values.filter((v) => norm.includes(normalize(v)));
      passed = found.length === 0;
      detail = passed ? "no forbidden phrases" : `found forbidden: [${found.join(", ")}]`;
      break;
    }
    case "regex": {
      let re: RegExp;
      try {
        re = new RegExp(check.pattern, check.flags);
      } catch (err) {
        return {
          label,
          type: check.type,
          passed: false,
          detail: `invalid regex: ${(err as Error).message}`,
          weight,
        };
      }
      passed = re.test(output);
      detail = passed ? "pattern matched" : "pattern did not match";
      break;
    }
    case "minLength": {
      const len = output.trim().length;
      passed = len >= check.chars;
      detail = `${len} chars (need ${check.chars})`;
      break;
    }
    case "refusal": {
      const refused = looksLikeRefusal(output);
      passed = refused === check.expected;
      detail = `refusal detected = ${refused}, expected = ${check.expected}`;
      break;
    }
  }

  return { label, type: check.type, passed, detail, weight };
}

/** Run all checks and compute a weighted score. A case passes iff ALL pass. */
export function scoreChecks(checks: Check[], output: string): {
  results: CheckResult[];
  passed: boolean;
  score: number;
} {
  const results = checks.map((c) => evalCheck(c, output));
  const totalWeight = results.reduce((s, r) => s + r.weight, 0) || 1;
  const gained = results.reduce((s, r) => s + (r.passed ? r.weight : 0), 0);
  const passed = results.every((r) => r.passed);
  return { results, passed, score: gained / totalWeight };
}
