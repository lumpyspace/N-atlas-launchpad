/**
 * Playground specs and the features they rely on: JSON-shape checks and test
 * cases that carry their own data.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { PLAYGROUNDS } from "../backend/src/blueprint/playground.ts";
import { USE_CASES } from "../backend/src/blueprint/useCases.ts";
import { evalCheck } from "../backend/src/eval/checks.ts";
import { parseCustomCases } from "../backend/src/eval/custom.ts";
import { runSuite, withContext } from "../backend/src/eval/runner.ts";
import type { GenerateOptions } from "../backend/src/providers/NAtlasProvider.ts";

test("every playground spec belongs to a real use case and its templates are well-formed", () => {
  const ids = new Set(USE_CASES.map((u) => u.id));
  for (const [id, spec] of Object.entries(PLAYGROUNDS)) {
    assert.ok(ids.has(id), `unknown use case ${id}`);
    for (const t of spec.templates) {
      const placeholders = [...t.prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const p of placeholders) assert.ok(t.fields.some((f) => f.name === p), `${id}/${t.id}: no field for {{${p}}}`);
      if (t.output === "json") assert.ok(t.schema && Object.keys(t.schema).length, `${id}/${t.id}: JSON output needs a schema`);
    }
  }
});

test("a game opens the Playground in task mode with a JSON event template", () => {
  const p = generateBlueprint("a gaming app like the sims").buildPlan.playground;
  assert.equal(p.mode, "task");
  assert.ok(p.templates.some((t) => t.output === "json" && t.schema?.reward === "number"));
  assert.match(p.sampleData!, /SAMPLE DATA/);
});

test("chat apps stay in chat mode", () => {
  assert.equal(generateBlueprint("A health assistant for pregnant women in Kano").buildPlan.playground.mode, "chat");
});

test("jsonShape check accepts wrapped JSON and reports missing or wrong fields", () => {
  const schema = { title: "string", reward: "number" } as const;
  assert.equal(evalCheck({ type: "jsonShape", schema }, 'Sure!\n```json\n{"title":"Help Ngozi","reward":50}\n```').passed, true);
  const missing = evalCheck({ type: "jsonShape", schema }, '{"title":"x"}');
  assert.equal(missing.passed, false);
  assert.match(missing.detail, /missing "reward"/);
  assert.match(evalCheck({ type: "jsonShape", schema }, '{"title":"x","reward":"50"}').detail, /should be number/);
  assert.match(evalCheck({ type: "jsonShape", schema }, "no json here").detail, /no JSON/);
});

test("a test case's saved data is added to the system prompt when it runs", async () => {
  const seen: (string | undefined)[] = [];
  const provider = {
    name: "spy",
    isMock: true,
    async generate(_p: string, o: GenerateOptions = {}) {
      seen.push(o.system);
      return { text: "ok", model: "spy", provider: "spy", isMock: true, latencyMs: 1 };
    },
    async generateStream() {},
    async health() {
      return { ok: true, provider: "spy", isMock: true, endpoint: null, model: "spy", detail: "" };
    },
  };
  const cases = parseCustomCases([{ id: "c", prompt: "Price of rice?", context: "Rice: ₦45,000", checks: [{ type: "minLength", chars: 1 }] }]);
  await runSuite({ name: "t", description: "", cases }, provider as any, { systemOverride: "You are PriceBot." });
  assert.equal(seen[0], withContext("You are PriceBot.", "Rice: ₦45,000"));
  assert.match(seen[0]!, /Answer only from these facts[\s\S]*Rice: ₦45,000/);
});

test("every channel's starter server is valid JavaScript", async () => {
  const { starterCode } = await import("../backend/src/blueprint/features.ts");
  for (const ch of ["web", "whatsapp", "telegram", "game", "mobile", "sms"]) {
    const { code } = starterCode(ch, [{ name: "Data", why: "x", kind: "live-data" }]);
    // Parse the body without running it (imports stripped).
    assert.doesNotThrow(() => new Function("return async () => {" + code.replace(/^import .*$/gm, "") + "}"), `${ch} server has a syntax error`);
  }
});
