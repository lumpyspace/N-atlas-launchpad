/**
 * Build plan: channel / voice / knowledge detection and the N-ATLAS-specific
 * guidance it produces.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";

test("WhatsApp customer-support bot needs live data and a WhatsApp step", () => {
  const { buildPlan: p } = generateBlueprint(
    "A WhatsApp bot that helps customers track orders and refunds in Pidgin",
  );
  assert.equal(p.channel.id, "whatsapp");
  assert.equal(p.knowledge.kind, "live-data");
  assert.ok(p.steps.some((s) => s.title === "Connect WhatsApp"));
  assert.ok(p.steps.some((s) => s.title === "Connect your data"));
  assert.ok(p.watchOut.some((w) => /Pidgin is not one of the four/.test(w)));
  assert.equal(p.voice.needed, false);
});

test("voice app for farmers who can't read gets the matching ASR models and no-TTS note", () => {
  const { buildPlan: p } = generateBlueprint(
    "A voice assistant for farmers who cannot read, in Hausa and Yoruba, advising on planting seasons",
  );
  assert.equal(p.voice.needed, true);
  const models = p.voice.models.map((m) => m.model);
  assert.ok(models.includes("NCAIR1/Hausa-ASR"));
  assert.ok(models.includes("NCAIR1/Yoruba-ASR"));
  const voiceStep = p.steps.find((s) => s.title === "Add voice input")!;
  assert.match(voiceStep.detail, /no text-to-speech/);
  assert.ok(p.architecture.some((n) => n.label === "Speech → text"));
});

test("plain idea defaults to web chat and always includes serving + licence guidance", () => {
  const { buildPlan: p } = generateBlueprint("A friendly assistant that tells Nigerian folktales");
  assert.equal(p.channel.id, "web");
  const serve = p.steps.find((s) => s.title === "Serve the model")!;
  assert.match(serve.code!, /repeat_penalty 1.12/);
  assert.ok(p.license.some((l) => /1,000 active end-users/.test(l)));
});

test("legal and USSD ideas get the relevant cautions", () => {
  const legal = generateBlueprint("An app that explains tenancy laws to Lagos renters").buildPlan;
  assert.ok(legal.knowledge.needed);
  assert.ok(legal.watchOut.some((w) => /high-stakes/.test(w)));
  const ussd = generateBlueprint("A USSD service for checking exam results").buildPlan;
  assert.equal(ussd.channel.id, "ussd");
  assert.ok(ussd.watchOut.some((w) => /182 characters/.test(w)));
});

test("use case drives specific tasks, data sources and techniques", () => {
  const bp = generateBlueprint("A JAMB past questions tutor for students in Pidgin and English");
  assert.equal(bp.buildPlan.useCase.ids[0], "exam-prep");
  assert.ok(bp.primaryTasks.includes("Grade the student's answer against the answer key"));
  const grade = bp.buildPlan.features.find((f) => f.task.startsWith("Grade"))!;
  assert.equal(grade.approach, "compute");
  assert.match(grade.how, /never ask the model/);
  assert.ok(bp.buildPlan.dataSources.some((d) => /answer keys/.test(d.name)));
  // the generated system prompt lists the same tasks
  assert.match(bp.systemPrompt, /Grade the student's answer/);
});

test("two use cases in one idea are combined in mention order", () => {
  const p = generateBlueprint(
    "A WhatsApp assistant giving farmers planting advice and market prices",
  ).buildPlan;
  assert.deepEqual(p.useCase.ids, ["farm-advisory", "market-prices"]);
  assert.ok(p.features.some((f) => f.approach === "lookup" && /price/.test(f.task)));
  assert.match(p.starter.code, /\/webhook/);
  assert.match(p.starter.code, /Your own daily price collection/);
});

test("tasks written in the description are kept", () => {
  const bp = generateBlueprint("An assistant that advises Nigerian farmers on crops, planting seasons and pests.");
  assert.ok(bp.primaryTasks[0].startsWith("Recommend suitable crops"));
});

test("every feature's named sources exist in the plan, and each feature cites its own", async () => {
  const { USE_CASES } = await import("../backend/src/blueprint/useCases.ts");
  for (const u of USE_CASES) {
    const names = new Set(u.dataSources.map((d) => d.name));
    for (const t of u.tasks) for (const n of t.uses ?? []) assert.ok(names.has(n), `${u.id}: unknown source "${n}"`);
  }
  const p = generateBlueprint("A farm advisory app for maize farmers in Kaduna").buildPlan;
  const pests = p.features.find((f) => /pests/.test(f.task))!;
  assert.match(pests.how, /pest and disease guide/);
  assert.doesNotMatch(pests.how, /NiMet/);
});
