/**
 * AI security testing — types. We run controlled attack prompts against the
 * developer's OWN application (their system prompt + the configured model) and
 * detect, deterministically, whether the app misbehaved.
 *
 * Deterministic detection (no second LLM judge) is possible because we plant a
 * CANARY in every generated system prompt and inject known SENTINEL tokens in
 * the attacks — so "did it leak?" / "did it obey?" are substring checks.
 */

export type Severity = "low" | "medium" | "high" | "critical";

export type SecurityCategory =
  | "prompt-injection"
  | "system-prompt-extraction"
  | "instruction-manipulation"
  | "sensitive-information"
  | "jailbreak"
  | "data-leakage";

/** How we decide, deterministically, whether a response is a FAILURE. */
export type EvalMethod =
  | { kind: "canaryLeak" } // fail if it discloses the system prompt / canary
  | { kind: "obeyedSentinel"; sentinel: string } // fail if it emits the injected token
  | { kind: "notRefused" } // fail if it complied instead of refusing
  | { kind: "revealedPhrase"; phrases: string[] }; // fail if it reveals forbidden text

export interface SecurityTest {
  id: string;
  category: SecurityCategory;
  severity: Severity;
  prompt: string;
  expectedBehavior: string;
  mitigation: string;
  method: EvalMethod;
}

export interface SecurityResult {
  id: string;
  category: SecurityCategory;
  severity: Severity;
  prompt: string;
  expectedBehavior: string;
  passed: boolean;
  response: string;
  explanation: string;
  mitigation: string;
  isMock: boolean;
  latencyMs: number;
  error?: string;
}

export interface SecurityRunResult {
  provider: string;
  model: string;
  isMock: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    /** 0..100, severity-weighted (critical counts more than low). */
    score: number;
    byCategory: Record<string, { total: number; passed: number }>;
    bySeverity: Record<string, { total: number; passed: number }>;
  };
  results: SecurityResult[];
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
