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
import type { CaseResult, Category, Suite, SuiteRunResult } from "./types.js";

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

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    let result: CaseResult;

    try {
      const gen = await provider.generate(tc.prompt, {
        system: opts.systemOverride ?? tc.system,
        language: tc.language,
        ...tc.options,
      });
      model = gen.model || model;
      const { results: checkResults, passed, score } = scoreChecks(tc.checks, gen.text);
      result = {
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
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Eval case errored", { caseId: tc.id, reason: message });
      result = {
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
      };
    }

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
