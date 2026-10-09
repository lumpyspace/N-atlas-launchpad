/**
 * Evaluation-engine tests.
 *
 * These are deterministic: the check functions are pure, and the runner is
 * exercised with a scripted stub provider (and the real mock provider) so no
 * live N-ATLAS call is needed. They prove the SCORING logic is correct — the
 * thing the whole eval product depends on.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evalCheck,
  looksLikeRefusal,
  normalize,
  scoreChecks,
} from "../backend/src/eval/checks.ts";
import { runSuite } from "../backend/src/eval/runner.ts";
import { ScriptedTestProvider } from "./fixtures/ScriptedTestProvider.ts";
import type {
  GenerateResult,
  NAtlasProvider,
} from "../backend/src/providers/NAtlasProvider.ts";
import type { Suite } from "../backend/src/eval/types.ts";

test("normalize strips Yoruba diacritics so ASCII values still match", () => {
  const n = normalize("Ẹ Káàárọ̀");
  assert.ok(n.includes("aaro"), `expected 'aaro' in "${n}"`);
});

test("containsAny matches across diacritics and case", () => {
  const r = evalCheck({ type: "containsAny", values: ["aaro"] }, "Ẹ KÁÀÁRỌ̀ o!");
  assert.equal(r.passed, true);
});

test("notContains flags a forbidden phrase (safety)", () => {
  const r = evalCheck(
    { type: "notContains", values: ["detonator"] },
    "First attach the detonator to...",
  );
  assert.equal(r.passed, false);
});

test("refusal check: expected-refusal passes on a refusal, fails otherwise", () => {
  assert.equal(looksLikeRefusal("I'm sorry, I cannot help with that."), true);
  assert.equal(looksLikeRefusal("The capital is Abuja."), false);

  const good = evalCheck({ type: "refusal", expected: true }, "I cannot assist with that request.");
  assert.equal(good.passed, true);

  const overRefusal = evalCheck({ type: "refusal", expected: false }, "As an AI language model, I can't.");
  assert.equal(overRefusal.passed, false);
});

test("scoreChecks: a case passes only when ALL checks pass; score is the fraction", () => {
  const output = "The capital of Nigeria is Abuja.";
  const all = scoreChecks(
    [
      { type: "containsAny", values: ["abuja"] },
      { type: "refusal", expected: false },
    ],
    output,
  );
  assert.equal(all.passed, true);
  assert.equal(all.score, 1);

  const partial = scoreChecks(
    [
      { type: "containsAny", values: ["abuja"] }, // pass
      { type: "containsAny", values: ["lagos"] }, // fail
    ],
    output,
  );
  assert.equal(partial.passed, false);
  assert.equal(partial.score, 0.5);
});

test("runner scores a scripted provider correctly (deterministic)", async () => {
  // A stub that always returns a fixed, correct-looking answer.
  const stub: NAtlasProvider = {
    name: "stub",
    isMock: false,
    async generate(): Promise<GenerateResult> {
      return {
        text: "The capital of Nigeria is Abuja.",
        model: "stub-model",
        provider: "stub",
        isMock: false,
        latencyMs: 1,
      };
    },
    async health() {
      return {
        ok: true,
        provider: "stub",
        isMock: false,
        endpoint: null,
        model: "stub-model",
        detail: "stub",
        checkedAt: new Date().toISOString(),
      };
    },
  };

  const suite: Suite = {
    name: "unit",
    description: "unit test suite",
    cases: [
      {
        id: "pass-case",
        category: "factual",
        description: "should pass",
        prompt: "capital of Nigeria?",
        checks: [{ type: "containsAny", values: ["abuja"] }],
      },
      {
        id: "fail-case",
        category: "factual",
        description: "should fail",
        prompt: "capital of Nigeria?",
        checks: [{ type: "containsAny", values: ["lagos"] }],
      },
    ],
  };

  const run = await runSuite(suite, stub);
  assert.equal(run.isMock, false);
  assert.equal(run.summary.total, 2);
  assert.equal(run.summary.passed, 1);
  assert.equal(run.summary.failed, 1);
  assert.equal(run.summary.errored, 0);
  assert.equal(run.cases[0].passed, true);
  assert.equal(run.cases[1].passed, false);
});

test("runner propagates isMock=true from a test-double provider", async () => {
  const suite: Suite = {
    name: "unit-mock",
    description: "unit",
    cases: [
      {
        id: "any",
        category: "reliability",
        description: "x",
        prompt: "hello",
        checks: [{ type: "minLength", chars: 1 }],
      },
    ],
  };
  const run = await runSuite(suite, new ScriptedTestProvider());
  assert.equal(run.isMock, true, "a mock run must be flagged isMock:true");
  assert.equal(run.cases[0].isMock, true);
});

test("runner records an errored case without throwing", async () => {
  const boom: NAtlasProvider = {
    name: "boom",
    isMock: false,
    async generate(): Promise<GenerateResult> {
      throw new Error("endpoint down");
    },
    async health() {
      return {
        ok: false,
        provider: "boom",
        isMock: false,
        endpoint: null,
        model: "n/a",
        detail: "down",
        checkedAt: new Date().toISOString(),
      };
    },
  };
  const suite: Suite = {
    name: "unit-err",
    description: "unit",
    cases: [
      {
        id: "err",
        category: "factual",
        description: "x",
        prompt: "hi",
        checks: [{ type: "containsAny", values: ["x"] }],
      },
    ],
  };
  const run = await runSuite(suite, boom);
  assert.equal(run.summary.errored, 1);
  assert.equal(run.cases[0].error, "endpoint down");
  assert.equal(run.cases[0].passed, false);
});
