/**
 * Security runner — fires each attack at the app (its system prompt + the
 * configured model), scores the response with the deterministic detectors, and
 * aggregates a severity-weighted score. Same honesty rules as the eval runner:
 * sequential, never fabricates, propagates `isMock`.
 */

import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { evaluateSecurity } from "./checks.js";
import { getSecuritySuite } from "./suites.js";
import {
  SEVERITY_WEIGHT,
  type SecurityResult,
  type SecurityRunResult,
} from "./types.js";

export interface SecurityRunOptions {
  /** Cap how many tests run (slow CPU demos). */
  maxTests?: number;
  /** Run only these test ids (used by Improve to re-test the ones that failed). */
  only?: string[];
}

export async function runSecuritySuite(
  systemPrompt: string,
  provider: NAtlasProvider,
  opts: SecurityRunOptions = {},
): Promise<SecurityRunResult> {
  let tests = getSecuritySuite(opts.only);
  if (opts.maxTests) tests = tests.slice(0, opts.maxTests);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  logger.info("Starting security run", {
    tests: tests.length,
    provider: provider.name,
    isMock: provider.isMock,
  });

  const results: SecurityResult[] = [];
  let model = provider.isMock ? provider.name : "n-atlas";

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
      const gen = await provider.generate(t.prompt, {
        system: systemPrompt,
        temperature: 0.2,
        maxTokens: 256,
      });
      model = gen.model || model;
      const verdict = evaluateSecurity(t.method, gen.text, systemPrompt);
      results.push({
        id: t.id,
        category: t.category,
        severity: t.severity,
        prompt: t.prompt,
        expectedBehavior: t.expectedBehavior,
        passed: verdict.passed,
        response: gen.text,
        explanation: verdict.explanation,
        mitigation: t.mitigation,
        isMock: gen.isMock,
        latencyMs: gen.latencyMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Security test errored", { id: t.id, reason: message });
      results.push({
        id: t.id,
        category: t.category,
        severity: t.severity,
        prompt: t.prompt,
        expectedBehavior: t.expectedBehavior,
        passed: false,
        response: "",
        explanation: `Test errored: ${message}`,
        mitigation: t.mitigation,
        isMock: provider.isMock,
        latencyMs: 0,
        error: message,
      });
    }
    const last = results[results.length - 1];
    logger.info(
      `  [${i + 1}/${tests.length}] ${t.id} — ${last.error ? "ERROR" : last.passed ? "PASS" : "FAIL"} (${t.severity})`,
    );
  }

  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.error).length;
  const failed = results.length - passed - errored;

  const byCategory: Record<string, { total: number; passed: number }> = {};
  const bySeverity: Record<string, { total: number; passed: number }> = {};
  let weightTotal = 0;
  let weightPassed = 0;
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, passed: 0 };
    byCategory[r.category].total += 1;
    bySeverity[r.severity] ??= { total: 0, passed: 0 };
    bySeverity[r.severity].total += 1;
    const w = SEVERITY_WEIGHT[r.severity];
    weightTotal += w;
    if (r.passed) {
      byCategory[r.category].passed += 1;
      bySeverity[r.severity].passed += 1;
      weightPassed += w;
    }
  }

  const score = weightTotal ? Math.round((weightPassed / weightTotal) * 100) : 0;
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  logger.info("Security run complete", { passed, failed, errored, score, durationMs });

  return {
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
      score,
      byCategory,
      bySeverity,
    },
    results,
  };
}
