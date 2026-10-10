import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { checkSection, factsFor, featurePrompt, parseFeature, parseSection, sectionPrompt } from "../backend/src/blueprint/narrate.ts";

const bp = generateBlueprint("A note-taking app for university students that summarises lectures and makes flashcards");

test("narrate: prompts carry the engine's facts and ask for the project's language", () => {
  const { system, prompt } = sectionPrompt("summary", bp, "ha");
  assert.match(system, /Hausa/);
  assert.match(system, /Use only the facts/);
  assert.ok(prompt.includes(bp.name));
  assert.ok(prompt.includes(factsFor(bp)));
  assert.ok(prompt.includes(bp.buildPlan.useCase.summary), "the engine's text is the starting point");
  assert.match(sectionPrompt("purpose", bp, "yo").system, /tone marks/);
  const feature = featurePrompt(bp, 1, "ig").prompt;
  assert.ok(feature.includes(bp.buildPlan.features[1].task), "one feature per request");
  assert.match(feature, /<feature name>: <explanation>/);
});

test("narrate: sections are parsed from N-ATLAS's text", () => {
  assert.deepEqual(parseSection("conversation", "User: Abeg help me\nApp: I fit help you.", bp).value, {
    user: "Abeg help me",
    app: "I fit help you.",
  });
  assert.equal(parseSection("conversation", "Abeg help me", bp).problem, "not in the User:/App: format");
  assert.deepEqual(parseSection("mvp", "- one thing\n- **two** things\n3. three things", bp).value, ["one thing", "two things", "three things"]);
  assert.equal(parseSection("mvp", "just a sentence", bp).problem, "not a list");
  const n = bp.buildPlan.features.length;
  const lines = Array.from({ length: n }, (_, i) => `${i + 1}. Feature ${i + 1}: How it works number ${i + 1}.`).join("\n");
  assert.equal((parseSection("features", lines, bp).value as unknown[]).length, n);
  assert.match(parseSection("features", "1. Only one: line", bp).problem ?? "", /expected/);
  assert.equal(parseSection("purpose", "  ", bp).problem, "empty");
  assert.deepEqual(parseFeature("2. Taƙaita darasi: Manhajar tana karanta bayanan kuma tana taƙaita su."), {
    task: "Taƙaita darasi",
    how: "Manhajar tana karanta bayanan kuma tana taƙaita su.",
  });
  assert.equal(parseFeature("Just a sentence without a name"), undefined);
});

test("narrate: replies cut off by the token limit lose their unfinished part", () => {
  const list = "- Loda bayanan darasi\n- Taƙaita darasi\n- Yi flashcards\n- Kiyaye bayanan ɗalibai na sir";
  assert.deepEqual(parseSection("pitfalls", list, bp, true).value, ["Loda bayanan darasi", "Taƙaita darasi", "Yi flashcards"]);
  assert.equal((parseSection("pitfalls", list, bp, false).value as string[]).length, 4);
  assert.equal(
    parseSection("summary", "It helps students revise their own lecture notes. It turns notes into flashcards and quizzes them on wh", bp, true).value,
    "It helps students revise their own lecture notes.",
  );
  assert.equal(parseSection("purpose", "It helps students revise their notes and make flash", bp, true).problem, "cut off");
  assert.equal(parseFeature("Flashcards: Makes cards from notes. Then it quizz", true)?.how, "Makes cards from notes.");
});

test("narrate: checks keep wrong-language, looping or made-up text out", () => {
  const hausa = "Wannan app yana taimaka wa dalibai su taƙaita darussa kuma su yi flashcards daga bayanan su.";
  assert.equal(checkSection(hausa, bp, "ha"), null);
  assert.match(checkSection("This app helps students summarise their lectures and make flashcards.", bp, "ha") ?? "", /not written in Hausa/);
  assert.match(checkSection("Ẹ jọ̀ọ́, ohun èlò yìí ń ràn àwọn akẹ́kọ̀ọ́ lọ́wọ́ láti ṣe àkópọ̀ ẹ̀kọ́ wọn.", bp, "en") ?? "", /not English/);
  assert.match(checkSection("It helps you study. It helps you study. It helps you study. It helps you study. It helps you study.", bp, "en") ?? "", /repeats/);
  assert.match(checkSection("Built with ChatGPT for students.", bp, "en") ?? "", /another AI model/);
  assert.match(checkSection("Students pay ₦25,000 a term for the premium plan.", bp, "en") ?? "", /25,000.*isn't in the facts/);
  // Numbers from the facts are fine.
  assert.equal(checkSection("N-ATLAS reads up to 8,092 tokens, so keep notes short for students.", bp, "en"), null);
});

test("narrate route: streams each section, keeps good ones, reports failed checks, stops on errors", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { narrateRouter } = await import("../backend/src/routes/narrate.ts");
  const n = bp.buildPlan.features.length;
  const replies: Record<string, string> = {
    "one sentence": "Wannan app yana taimaka wa dalibai na jami'a su taƙaita darussa kuma su yi flashcards.",
    "short sentences": "This is English, which a Hausa project should not get.",
    "short example": "User: Ina so in taƙaita darasi na.\nApp: Da kyau, zan taimaka maka. Don Allah ka aiko da bayanan darasin.",
  };
  const featureCalls: string[] = [];
  const provider = {
    name: "scripted", isMock: true,
    async generate() { throw new Error("unused"); },
    async generateStream(prompt: string, _o: unknown, onChunk: (c: any) => void) {
      if (prompt.includes("first version")) throw new Error("N-ATLAS endpoint returned HTTP 500");
      if (prompt.includes("<feature name>: <explanation>")) {
        featureCalls.push(prompt);
        // The second feature's first answer isn't in shape; the retry is.
        const second = prompt.includes(bp.buildPlan.features[1].task);
        const reply =
          second && featureCalls.filter((p) => p.includes(bp.buildPlan.features[1].task)).length === 1
            ? "Wannan fasali yana da kyau sosai"
            : "Fasali: Manhajar tana yin wannan da bayanan ɗalibin kuma tana nuna tushen.";
        onChunk({ type: "delta", delta: reply });
        return;
      }
      const key = Object.keys(replies).find((k) => prompt.includes(k));
      for (const word of (key ? replies[key] : "").split(/(?<= )/)) onChunk({ type: "delta", delta: word });
    },
    async health() { return { ok: true } as any; },
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", narrateRouter(provider as any));
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/blueprint/narrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint: bp, language: "ha" }),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    const sections = events.filter((e) => e.type === "section");
    assert.equal(sections[0].section, "purpose");
    assert.match(sections[0].value, /dalibai/);
    assert.equal(sections[1].section, "summary");
    assert.match(sections[1].problem, /not written in Hausa/);
    assert.deepEqual(Object.keys(sections[2].value), ["user", "app"]);
    // N-ATLAS failing (not a bad answer) stops the run instead of saving a "failure".
    const error = events.find((e) => e.type === "error");
    assert.equal(error.section, "mvp");
    assert.ok(!events.some((e) => e.type === "start" && e.section === "features"), `stopped before features (${n})`);
    assert.equal(events.at(-1).type, "done");

    // Features: written one at a time, a bad answer retried once.
    const feats = await fetch(`http://127.0.0.1:${port}/api/blueprint/narrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint: bp, language: "ha", sections: ["features"] }),
    });
    const fe = (await feats.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    const done = fe.find((e) => e.type === "section");
    assert.ok(done.value, JSON.stringify(done));
    assert.equal(done.value.length, n);
    assert.equal(featureCalls.length, n + 1, "one call per feature, plus one retry");

    const bad = await fetch(`http://127.0.0.1:${port}/api/blueprint/narrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint: { name: "x" } }),
    });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test("narrate: a phrase shared across list items isn't a repetition loop", () => {
  const items = ["The app should store notes privately.", "The app should summarise each lecture.", "The app should make flashcards.", "The app should cite the note it used."];
  assert.equal(checkSection(items, bp, "en"), null);
  assert.match(checkSection(["It helps you study it helps you study it helps you study it helps you study"], bp, "en") ?? "", /repeats/);
});
