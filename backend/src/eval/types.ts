/**
 * Evaluation engine — core types.
 *
 * The engine turns a *suite* of Nigerian-context test cases into a scored run.
 * Each case carries declarative `checks` (assertions over the model's answer),
 * so the test data is self-describing and the runner stays generic.
 *
 * HONESTY RULE: every run result carries `isMock`. If the live provider is the
 * MOCK, the whole run is flagged so a score can never be mistaken for a real
 * N-ATLAS evaluation.
 */

import type { GenerateOptions } from "../providers/NAtlasProvider.js";

/** Broad buckets a case belongs to — used for per-category scoring. */
export type Category =
  | "translation"
  | "factual"
  | "safety"
  | "reliability"
  | "language";

/** Supported language tags for N-ATLAS (hint only). */
export type Lang = "en" | "yo" | "ha" | "ig";

/**
 * A declarative check applied to the model's output text.
 *
 * Text matching (containsAny/containsAll/notContains) is DIACRITIC- and
 * CASE-INSENSITIVE so that e.g. "kaaro" matches "Ẹ Káàárọ̀" — essential for
 * fairly scoring Yoruba/Hausa/Igbo output without brittle exact-accent matches.
 */
export type Check =
  /** Passes if the output contains at least one of `values`. */
  | { type: "containsAny"; values: string[]; label?: string; weight?: number }
  /** Passes if the output contains every one of `values`. */
  | { type: "containsAll"; values: string[]; label?: string; weight?: number }
  /** SAFETY: passes only if the output contains NONE of `values`. */
  | { type: "notContains"; values: string[]; label?: string; weight?: number }
  /** Passes if `pattern` (JS regex) matches the output. */
  | { type: "regex"; pattern: string; flags?: string; label?: string; weight?: number }
  /** Passes if the output is at least `chars` long (after trim). */
  | { type: "minLength"; chars: number; label?: string; weight?: number }
  /**
   * Refusal check. `expected: true` passes when the model DID refuse (good for
   * unsafe prompts); `expected: false` passes when it did NOT refuse (good for
   * benign prompts it should answer).
   */
  | { type: "refusal"; expected: boolean; label?: string; weight?: number };

/** One Nigerian-context test case. */
export interface TestCase {
  id: string;
  category: Category;
  /** Short human description of what this case probes. */
  description: string;
  /** The prompt sent to N-ATLAS. */
  prompt: string;
  /** Optional language hint / system prompt / generation overrides. */
  language?: Lang;
  system?: string;
  options?: GenerateOptions;
  /** Assertions over the answer. A case passes only if ALL checks pass. */
  checks: Check[];
}

/** A named collection of test cases. */
export interface Suite {
  name: string;
  description: string;
  cases: TestCase[];
}

/** Result of one check against one output. */
export interface CheckResult {
  label: string;
  type: Check["type"];
  passed: boolean;
  /** Human-readable reason (what matched / what was missing). */
  detail: string;
  weight: number;
}

/** Result of running one test case. */
export interface CaseResult {
  caseId: string;
  category: Category;
  language?: Lang;
  prompt: string;
  /** The model's answer (or "" if the call errored). */
  output: string;
  isMock: boolean;
  /** True only if every check passed and there was no error. */
  passed: boolean;
  /** Weighted fraction of checks passed, 0..1. */
  score: number;
  checks: CheckResult[];
  latencyMs: number;
  /** Populated if the provider call threw (e.g. endpoint down). */
  error?: string;
}

/** Full scored run of a suite. */
export interface SuiteRunResult {
  suite: string;
  provider: string;
  model: string;
  /** HARD flag: true means these results are NOT from real N-ATLAS. */
  isMock: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    /** passed / total, 0..1. */
    passRate: number;
    byCategory: Record<string, { total: number; passed: number }>;
  };
  cases: CaseResult[];
}
