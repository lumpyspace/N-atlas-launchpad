/**
 * Use-case detection against a set of realistic app ideas. When someone
 * reports a misclassified idea, add it here first, then fix the detector.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { detectUseCases } from "../backend/src/blueprint/useCases.ts";

const IDEAS: [string, string][] = [
  // reported: a Sims-like game was classified as a sports app
  ["a gaming app like the sims", "game"],
  ["I want to build a gaming app like the sims where characters speak Yoruba and Pidgin", "game"],
  ["An RPG where NPCs give quests in Hausa", "game"],
  ["A Roblox game with a talking market woman", "game"],
  ["A football app that gives live scores and fixtures in Pidgin", "sports"],
  ["A bot for Super Eagles fans to chat about matches", "sports"],
  ["An assistant that advises Nigerian farmers on crops, planting seasons and pests", "farm-advisory"],
  ["A WhatsApp bot that tells traders food prices in Mile 12 market", "market-prices"],
  ["A JAMB past questions tutor for students in Pidgin", "exam-prep"],
  ["Help students understand university admission requirements and cut-off marks", "admissions"],
  ["A Telegram bot for a fintech app that answers questions about failed transfers", "fintech-support"],
  ["An app that helps young people budget their monthly salary", "budgeting"],
  ["Customer support for my online shop that tracks orders and refunds", "customer-support"],
  ["An app that explains tenancy laws to Lagos renters", "legal-rights"],
  ["A health assistant for pregnant women in Kano", "health-info"],
  ["Explain how to get a NIN or renew a passport", "gov-services"],
  ["Translate English to Yoruba for small businesses", "translation"],
  ["Tell Igbo folktales to children at bedtime", "content"],
  ["Help NYSC members improve their CV and prepare for interviews", "jobs"],
  ["A friendly chatbot for Nigerians", "general"],
  // added kinds of app
  ["Transcribe Yoruba meeting recordings and write the minutes", "transcription"],
  ["Add Hausa subtitles to our YouTube videos", "transcription"],
  ["Analyse customer feedback from our survey in Pidgin and English", "feedback-analysis"],
  ["Help people write application letters and petitions", "writing-assistant"],
  ["Fact-check viral WhatsApp messages before elections", "news-factcheck"],
  ["Summarise the news in Igbo every morning", "news-factcheck"],
  ["Help small business owners record sales and send invoices", "small-business"],
  ["A phonics and numeracy app for primary school pupils", "kids-learning"],
  ["Emotional support for students dealing with stress and anxiety", "mental-health"],
  ["A daily Bible devotional app for our church in Yoruba", "faith"],
  ["Suggest Nigerian recipes and meal plans on a budget", "recipes"],
  ["Help people find apartments to rent in Lagos and avoid fake agents", "property"],
  ["Tell commuters which BRT bus route to take and the fares", "transport"],
  ["A tourism guide for visitors to Calabar with hotels and attractions", "travel"],
  // reported: a note-taking app for students was classified as admissions
  ["A note-taking app for university students", "study-notes"],
  ["an app that helps university students take notes in lectures and revise", "study-notes"],
  ["Turn my lecture slides into flashcards", "study-notes"],
  // overlaps that must resolve correctly
  ["A WhatsApp bot that tells market women today's food prices", "market-prices"],
  ["A cover letter and CV helper for job seekers", "jobs"],
];

for (const [idea, expected] of IDEAS) {
  test(`"${idea}" → ${expected}`, () => {
    assert.equal(detectUseCases(idea)[0].id, expected);
  });
}

test("the Sims-like game gets a game plan, not sports or voice", () => {
  const bp = generateBlueprint("I want to build a gaming app like the sims where characters speak Yoruba and Pidgin");
  const p = bp.buildPlan;
  assert.equal(p.useCase.ids[0], "game");
  assert.equal(p.channel.id, "game");
  assert.equal(p.voice.needed, false, "characters speaking is not users sending voice");
  assert.ok(bp.primaryTasks.some((t) => /dialogue/.test(t)));
  assert.ok(!bp.primaryTasks.some((t) => /scores|fixtures/.test(t)));
  assert.match(p.starter.code, /\/npc\/line/);
  assert.equal(bp.name, "Gaming App");
});

test("a developer-chosen use case overrides detection", () => {
  const bp = generateBlueprint("a gaming app like the sims", { useCase: "content" });
  assert.equal(bp.buildPlan.useCase.ids[0], "content");
  assert.ok(bp.primaryTasks.some((t) => /stories|folktales/.test(t)));
});

test("voice is detected only when users talk to the app", () => {
  const voice = (d: string) => generateBlueprint(d).buildPlan.voice.needed;
  assert.equal(voice("A voice assistant for farmers who cannot read"), true);
  assert.equal(voice("Farmers send voice notes on WhatsApp"), true);
  assert.equal(voice("A chatbot that speaks Yoruba"), false);
});

test("tasks the developer writes are classified by their wording", async () => {
  const { planFeature } = await import("../backend/src/blueprint/features.ts");
  const kind = (t: string) => planFeature(t, [], "web").approach;
  assert.equal(kind("Identify plant disease from a photo"), "vision");
  assert.equal(kind("Send daily price alerts"), "schedule");
  assert.equal(kind("Check my order status"), "lookup");
  assert.equal(kind("Calculate loan interest"), "compute");
  assert.equal(kind("Translate menus into Hausa"), "prompt");
});

test("descriptions written as instructions get a proper name and purpose", () => {
  const bp = generateBlueprint("Help small business owners record sales and send invoices");
  assert.equal(bp.name, "Small Business Assistant");
  assert.equal(bp.purpose, "an assistant that helps small business owners record sales and send invoices");
  const t = generateBlueprint("Transcribe Yoruba meeting recordings and write the minutes");
  assert.equal(t.name, "Transcription & Subtitles Assistant");
  assert.match(t.systemPrompt, /^You are Transcription & Subtitles Assistant, an assistant that helps transcribe/);
});

test("note-taking app gets a study plan, a proper name and no admissions content", () => {
  const bp = generateBlueprint("an app that helps university students take notes in lectures and revise");
  assert.equal(bp.buildPlan.useCase.ids[0], "study-notes");
  assert.equal(bp.name, "Notes & Study Assistant");
  assert.ok(!bp.primaryTasks.some((t) => /cut-off|admission|brochure/i.test(t)));
  assert.ok(bp.primaryTasks.some((t) => /flashcards/i.test(t)));
  assert.equal(bp.buildPlan.playground.mode, "task");
});

test("'voice notes' and 'meeting notes' are not study notes", () => {
  const ids = (d: string) => detectUseCases(d).map((u) => u.id);
  assert.ok(!ids("A WhatsApp voice-note assistant for farmers giving planting advice and market prices").includes("study-notes"));
  assert.deepEqual(ids("A WhatsApp voice-note assistant for farmers giving planting advice and market prices"), ["farm-advisory", "market-prices"]);
  assert.ok(!ids("Transcribe Yoruba meeting notes from recordings").includes("study-notes"));
});

test("a kind of app can replace the sector's local context", () => {
  const ctx = generateBlueprint("A note-taking app for university students").nigerianContext.join(" ");
  assert.doesNotMatch(ctx, /cut-off|post-UTME/);
  assert.match(ctx, /GST|semester/i);
});
