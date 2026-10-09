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
