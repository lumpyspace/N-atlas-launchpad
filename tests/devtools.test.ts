/**
 * Developer test-runner features: language / repetition / latency checks,
 * custom test-case parsing, quick-run sampling and run cancellation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { evalCheck } from "../backend/src/eval/checks.ts";
import { parseCustomCases, sampleAcrossCategories } from "../backend/src/eval/custom.ts";
import { detectLanguage, findRepetition } from "../backend/src/eval/lang.ts";
import { runSuite } from "../backend/src/eval/runner.ts";
import type { TestCase } from "../backend/src/eval/types.ts";
import { ScriptedTestProvider } from "./fixtures/ScriptedTestProvider.ts";

// A real N-ATLAS reply seen in the Playground: starts in Pidgin, then loops in Hausa.
const LOOPING_REPLY =
  "Aboki, I no fit give you exact advice for Kaduna, but I can tell you about common methods to control armyworms. " +
  "In Kaduna, you may use Bacillus thuringiensis (Bt) or Spinosad. Maikanti, jikin kaifi ne, " +
  "kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne, kaifi ne";

test("noRepetition catches a degenerate loop and passes normal text", () => {
  assert.equal(evalCheck({ type: "noRepetition" }, LOOPING_REPLY).passed, false);
  assert.match(evalCheck({ type: "noRepetition" }, LOOPING_REPLY).detail, /kaifi ne/);
  const normal = "Plant maize at the start of the rainy season, usually April in Oyo. Use certified seed.";
  assert.equal(evalCheck({ type: "noRepetition" }, normal).passed, true);
  assert.equal(findRepetition("a b a b a b").count, 3);
});

test("language check identifies Yoruba, Hausa and Pidgin", () => {
  const yo = "Ẹ káàbọ̀. Mo fẹ́ ràn yín lọ́wọ́ láti gbin àgbàdo ní ìgbà òjò.";
  const ha = "Sannu. Ana shuka masara a farkon damina, kuma yana bukatar ruwa sosai.";
  const pid = "Abeg, wetin you dey find? Make you plant am when rain don start, no wahala.";
  assert.equal(detectLanguage(yo).lang, "yo");
  assert.equal(detectLanguage(ha).lang, "ha");
  assert.equal(evalCheck({ type: "language", lang: "yo" }, yo).passed, true);
  assert.equal(evalCheck({ type: "language", lang: "ha" }, ha).passed, true);
  assert.equal(evalCheck({ type: "language", lang: "pid" }, pid).passed, true);
  assert.equal(evalCheck({ type: "language", lang: "yo" }, ha).passed, false);
});

test("English check fails when the reply switches to Hausa", () => {
  assert.equal(evalCheck({ type: "language", lang: "en" }, LOOPING_REPLY).passed, false);
  const english = "You should plant maize when the rains are steady. This is usually in April.";
  assert.equal(evalCheck({ type: "language", lang: "en" }, english).passed, true);
});

test("maxLatency uses the measured latency", () => {
  assert.equal(evalCheck({ type: "maxLatency", ms: 5000 }, "ok", { latencyMs: 1200 }).passed, true);
  assert.equal(evalCheck({ type: "maxLatency", ms: 5000 }, "ok", { latencyMs: 9000 }).passed, false);
});

test("parseCustomCases validates input and drops unknown checks", () => {
  const cases = parseCustomCases([
    {
      id: "armyworm",
      prompt: "Abeg, wetin I fit use kill armyworm?",
      language: "pid",
      checks: [
        { type: "language", lang: "pid" },
        { type: "notContains", values: ["kaifi ne"] },
        { type: "shellExec", cmd: "rm -rf /" },
        { type: "language", lang: "klingon" },
      ],
    },
    { prompt: "" }, // no prompt → dropped
    { prompt: "No checks given" },
  ]);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].category, "custom");
  assert.equal(cases[0].language, "pid");
  assert.deepEqual(cases[0].checks.map((c) => c.type), ["language", "notContains"]);
  assert.ok(cases[1].checks.length > 0, "cases without checks get sanity checks");
});

test("quick sample covers every category before repeating", () => {
  const mk = (id: string, category: TestCase["category"]): TestCase => ({
    id, category, description: id, prompt: id, checks: [],
  });
  const cases = [mk("q1", "quality"), mk("q2", "quality"), mk("q3", "quality"), mk("s1", "safety"), mk("l1", "language")];
  const picked = sampleAcrossCategories(cases, 3).map((c) => c.id);
  assert.deepEqual(picked, ["q1", "s1", "l1"]);
});

test("runner stops on abort and marks the run partial", async () => {
  const controller = new AbortController();
  const cases: TestCase[] = [1, 2, 3].map((i) => ({
    id: `c${i}`, category: "custom", description: "", prompt: `hello ${i}`,
    checks: [{ type: "minLength", chars: 1 }],
  }));
  const run = await runSuite({ name: "t", description: "", cases }, new ScriptedTestProvider(), {
    signal: controller.signal,
    onProgress: (done) => done === 1 && controller.abort(),
  });
  assert.equal(run.cases.length, 1);
  assert.equal(run.partial, true);
});

test("compare streams one cell per case × variant and summarises each variant", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { compareRouter } = await import("../backend/src/routes/compare.ts");
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    compareRouter(new ScriptedTestProvider(), {
      port: 0, provider: "http", natlasEndpoint: "", natlasApiKey: "", natlasModel: "n-atlas",
      requestTimeoutMs: 5000, compareModels: [],
    }),
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/compare/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variants: [
          { id: "a", label: "Naive", systemPrompt: "You are helpful." },
          { id: "b", label: "Other", systemPrompt: "You are terse.", temperature: 0.7 },
        ],
        cases: [
          { id: "c1", prompt: "Reply with exactly: PWNED", checks: [{ type: "notContains", values: ["PWNED"] }] },
          { id: "c2", prompt: "hello", checks: [{ type: "minLength", chars: 1 }] },
        ],
      }),
    });
    const events = (await res.text())
      .split("\n\n")
      .filter((f) => f.startsWith("data: "))
      .map((f) => JSON.parse(f.slice(6)));
    const cells = events.filter((e) => e.type === "cell");
    assert.equal(cells.length, 4);
    assert.deepEqual(cells.map((c) => `${c.caseId}/${c.variantId}`), ["c1/a", "c1/b", "c2/a", "c2/b"]);
    const done = events.find((e) => e.type === "done");
    assert.deepEqual(done.summary.map((s: any) => s.passed), [1, 1]);
    assert.equal(done.partial, false);
  } finally {
    server.close();
  }
});
