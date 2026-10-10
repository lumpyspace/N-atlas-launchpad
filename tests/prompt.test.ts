/**
 * Prompt doctor: N-ATLAS-specific findings, one-click fixes and the
 * context budget.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { hardenSystemPrompt } from "../backend/src/improve/harden.ts";
import { applyFix, diagnose, estimateTokens } from "../backend/src/prompt/doctor.ts";

const sev = (r: ReturnType<typeof diagnose>, id: string) => r.findings.find((f) => f.id === id)?.severity;

test("a bare prompt gets the key N-ATLAS fixes", () => {
  const r = diagnose({ systemPrompt: "You are a helpful farming assistant for Nigerian farmers.", needsKnowledge: true });
  assert.equal(sev(r, "language-rule"), "fix");
  assert.equal(sev(r, "scope-rule"), "warn");
  assert.equal(sev(r, "uncertainty-rule"), "fix", "apps that answer from facts must not guess");
  assert.equal(sev(r, "hardened"), "warn");
  assert.equal(sev(r, "too-short"), "warn");
  assert.equal(r.findings[0].severity, "fix", "most serious first");
});

test("applying every fix resolves those findings", () => {
  let p = "You are a helpful farming assistant for Nigerian farmers. You give practical, safe advice about crops, planting seasons and pests in the user's region.";
  for (const f of diagnose({ systemPrompt: p }).findings) if (f.fix) p = applyFix(p, f.fix.line);
  const r = diagnose({ systemPrompt: p });
  for (const id of ["language-rule", "scope-rule", "uncertainty-rule"]) assert.equal(sev(r, id), "good", id);
  assert.ok(!r.findings.some((f) => f.id === "length-rule"));
});

test("generated blueprints already pass the language and uncertainty rules", () => {
  const bp = generateBlueprint("A WhatsApp bot that answers farmers in Yoruba and Pidgin about planting");
  const r = diagnose({ systemPrompt: bp.systemPrompt, languages: bp.languages });
  assert.equal(sev(r, "language-rule"), "good");
  assert.equal(sev(r, "uncertainty-rule"), "good");
  assert.equal(sev(r, "canary"), "info", "explains the planted security code");
  assert.equal(sev(r, "yoruba-tone-marks"), "info");
  assert.equal(sev(r, "pidgin-unofficial"), "info");
});

test("hardened prompts are recognised", () => {
  const bp = generateBlueprint("A customer support bot for my shop");
  const hardened = hardenSystemPrompt(bp.systemPrompt, ["prompt-injection"]).newPrompt;
  assert.equal(sev(diagnose({ systemPrompt: hardened }), "hardened"), "good");
});

test("fixes go before the security note and aren't added twice", () => {
  const p = "You are X.\n- Rule one.\n\n(Internal note: support reference code ATLAS-SENTINEL-ABC123.)";
  const once = applyFix(p, "- Rule two.");
  assert.equal(once, "You are X.\n- Rule one.\n- Rule two.\n\n(Internal note: support reference code ATLAS-SENTINEL-ABC123.)");
  assert.equal(applyFix(once, "- Rule two."), once);
});

test("the budget adds prompt, data, message and reply, and flags overflow", () => {
  const small = diagnose({ systemPrompt: "You are X.", maxTokens: 512 });
  assert.equal(small.budget.limit, 8092);
  assert.ok(small.budget.total < 700);
  const huge = diagnose({ systemPrompt: "word ".repeat(9000), data: "fact ".repeat(4000), maxTokens: 512 });
  assert.ok(huge.budget.share > 1);
  assert.equal(sev(huge, "over-budget"), "fix");
  assert.equal(sev(huge, "too-long"), "warn");
});

test("token estimate counts accented Yoruba letters as more expensive", () => {
  assert.ok(estimateTokens("Ẹ káàbọ̀ sí ilé wa") > estimateTokens("Welcome to our home"));
  assert.equal(estimateTokens(""), 0);
});
