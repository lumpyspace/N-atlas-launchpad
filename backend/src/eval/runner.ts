/**
 * Suite runner — sends each test case to N-ATLAS through the provider, scores
 * the answer with the declarative checks, and aggregates a run summary.
 *
 * Design notes:
 *   - SEQUENTIAL on purpose. CPU inference of an 8B model is slow and serialised
 *     anyway; running cases one-by-one keeps memory flat and logs readable.
 *   - NEVER fabricates. If a provider call throws, that case is recorded as
 *     `errored` with the reason — it is not silently passed or failed.
 *   - Propagates `isMock` from the provider to the whole run, so mock results
 *     can never be mistaken for a real N-ATLAS evaluation.
 */

import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { scoreChecks } from "./checks.js";
import { getSuite } from "./suites.js";
import type { CaseResult, Category, Suite, SuiteRunResult, TestCase } from "./types.js";

export interface RunOptions {
  /** Run only the first N cases (handy for slow CPU demos). */
  maxCases?: number;
  /**
   * Run every case with THIS system prompt instead of the case's own. Used when
   * evaluating a developer's application as configured — the whole point is to
   * test their system prompt, so it overrides any per-case system.
   */
  systemOverride?: string;
  /** Optional progress callback (case index, total, latest result). */
  onProgress?: (done: number, total: number, result: CaseResult) => void;
  /** Called once the case list is known, before the first case runs. */
  onStart?: (total: number) => void;
  /** Stop early (e.g. the client disconnected); the run is returned as partial. */
  signal?: AbortSignal;
  /** Default reply length for cases that don't set their own. */
  maxTokens?: number;
}

export async function runSuite(
  suiteOrName: string | Suite,
  provider: NAtlasProvider,
  opts: RunOptions = {},
): Promise<SuiteRunResult> {
  const suite = typeof suiteOrName === "string" ? getSuite(suiteOrName) : suiteOrName;
  if (!suite) {
    throw new Error(`Unknown suite "${suiteOrName}".`);
  }

  const cases = opts.maxCases ? suite.cases.slice(0, opts.maxCases) : suite.cases;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  logger.info("Starting evaluation run", {
    suite: suite.name,
    cases: cases.length,
    provider: provider.name,
    isMock: provider.isMock,
  });

  const results: CaseResult[] = [];
  let model = provider.isMock ? "mock-provider" : "n-atlas";
  opts.onStart?.(cases.length);

  for (let i = 0; i < cases.length; i++) {
    if (opts.signal?.aborted) break;
    const tc = cases[i];
    const result = await runCase(tc, provider, opts);
    if (!result) break; // stopped mid-case: drop it, the run is partial
    model = result.model ?? model;

    results.push(result);
    logger.info(
      `  [${i + 1}/${cases.length}] ${tc.id} — ${result.error ? "ERROR" : result.passed ? "PASS" : "FAIL"}`,
      { score: Number(result.score.toFixed(2)), latencyMs: result.latencyMs },
    );
    opts.onProgress?.(i + 1, cases.length, result);
  }

  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.error).length;
  const failed = results.length - passed - errored;

  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    const key = r.category as Category;
    byCategory[key] ??= { total: 0, passed: 0 };
    byCategory[key].total += 1;
    if (r.passed) byCategory[key].passed += 1;
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const run: SuiteRunResult = {
    suite: suite.name,
    provider: provider.name,
    model,
    isMock: provider.isMock,
    partial: results.length < cases.length,
    startedAt,
    finishedAt,
    durationMs,
    summary: {
      total: results.length,
      passed,
      failed,
      errored,
      passRate: results.length ? passed / results.length : 0,
      byCategory,
    },
    cases: results,
  };

  logger.info("Evaluation run complete", {
    suite: suite.name,
    passed,
    failed,
    errored,
    passRate: Number(run.summary.passRate.toFixed(2)),
    durationMs,
    isMock: provider.isMock,
  });

  return run;
}

export interface CaseRunOptions {
  systemOverride?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Run one test case and score it. Returns null if the call was cancelled via
 * `signal` (so callers can drop it); provider errors become an errored result.
 */
export async function runCase(
  tc: TestCase,
  provider: NAtlasProvider,
  opts: CaseRunOptions = {},
): Promise<(CaseResult & { model?: string }) | null> {
  try {
    const gen = await provider.generate(tc.prompt, {
      system: opts.systemOverride ?? tc.system,
      language: tc.language,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      ...tc.options,
      signal: opts.signal,
    });
    const { results: checkResults, passed, score } = scoreChecks(tc.checks, gen.text, {
      latencyMs: gen.latencyMs,
    });
    return {
      caseId: tc.id,
      category: tc.category,
      language: tc.language,
      prompt: tc.prompt,
      output: gen.text,
      isMock: gen.isMock,
      passed,
      score,
      checks: checkResults,
      latencyMs: gen.latencyMs,
      description: tc.description,
      model: gen.model || undefined,
    };
  } catch (err) {
    if (opts.signal?.aborted) return null;
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Eval case errored", { caseId: tc.id, reason: message });
    return {
      caseId: tc.id,
      category: tc.category,
      language: tc.language,
      prompt: tc.prompt,
      output: "",
      isMock: provider.isMock,
      passed: false,
      score: 0,
      checks: [],
      latencyMs: 0,
      error: message,
      description: tc.description,
    };
  }
}
