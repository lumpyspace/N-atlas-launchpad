/**
 * Design chat: slot-filling interview, brief assembly, reply prompt and the
 * streaming route (with a scripted model).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { composeDescription, replyPrompt, snapshot, splitList } from "../backend/src/design/interview.ts";

test("the interview starts by asking for the idea", () => {
  const s = snapshot({});
  assert.equal(s.nextSlot, "idea");
});

test("answers fill the brief, and the engine suggests the rest", () => {
  const s = snapshot({ idea: "A note-taking app for university students" });
  assert.equal(s.blueprint.buildPlan.useCase.ids[0], "study-notes");
  assert.equal(s.nextSlot, "users");
  assert.equal(s.brief.idea.fromYou, true);
  assert.equal(s.brief.features.fromYou, false, "features are suggestions until the developer answers");
  assert.ok(s.brief.features.value.some((f) => /flashcards/i.test(f)));
});

test("the developer's features and users are used verbatim in the blueprint", () => {
  const s = snapshot({
    idea: "A note-taking app for university students",
    users: "first-year medical students at UNILAG",
    problem: "they miss things in fast lectures",
    features: "record lectures, summarise them, and make flashcards",
  });
  assert.equal(s.blueprint.targetUsers, "first-year medical students at UNILAG");
  assert.deepEqual(s.blueprint.primaryTasks, ["record lectures", "summarise them", "make flashcards"]);
  assert.equal(s.brief.features.fromYou, true);
});

test("questions already answered by the idea are skipped", () => {
  const s = snapshot({
    idea: "A WhatsApp bot in Yoruba for farmers",
    users: "cassava farmers in Ogun",
    problem: "no extension officer nearby",
    features: "planting advice",
  });
  assert.notEqual(s.nextSlot, "channel", "WhatsApp was already mentioned");
  assert.notEqual(s.nextSlot, "languages", "Yoruba was already mentioned");
  assert.equal(s.nextSlot, "data");
  assert.match(s.question, /NiMet|crop calendar/i, "the data question suggests sources for this kind of app");
});

test("the interview finishes once every slot is answered", () => {
  const s = snapshot({
    idea: "A note app", users: "students", problem: "messy notes", features: "summaries",
    channel: "web", languages: "English", data: "their notes", limits: "never write assignments",
  });
  assert.equal(s.nextSlot, "done");
  assert.deepEqual(s.openQuestions, []);
});

test("the reply prompt carries the brief, notes, recent history and the next question, in the user's language", () => {
  const s = snapshot({ idea: "App wey go help market women know price" });
  const { system, prompt } = replyPrompt(s, [{ role: "user", content: "Abeg, I wan build app wey go help market women know price for Mile 12" }]);
  assert.match(system, /Reply in Nigerian Pidgin/);
  assert.match(prompt, /App brief so far/);
  assert.match(prompt, /N-ATLAS notes/);
  assert.ok(prompt.includes(s.question));
});

test("list answers are split and descriptions composed from all slots", () => {
  assert.deepEqual(splitList("record lectures, summarise them and make flashcards"), ["record lectures", "summarise them", "make flashcards"]);
  assert.match(composeDescription({ idea: "X app", users: "students" }), /X app\. It is for students/);
});

test("the design route streams a snapshot first, then the reply, and always asks the question", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { designRouter } = await import("../backend/src/routes/design.ts");
  // A scripted model that ignores the instruction to ask the question.
  const provider = {
    name: "scripted", isMock: true,
    async generate() { throw new Error("unused"); },
    async generateStream(_p: string, _o: unknown, onChunk: (c: any) => void) {
      onChunk({ type: "delta", delta: "Nice idea — students need this." });
    },
    async health() { return { ok: true } as any; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api", designRouter(provider as any));
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/design/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answers: { idea: "A note-taking app for university students" },
        history: [{ role: "user", content: "A note-taking app for university students" }],
      }),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    assert.equal(events[0].type, "snapshot");
    assert.equal(events[0].snapshot.nextSlot, "users");
    const reply = events.filter((e) => e.type === "delta").map((e) => e.delta).join("");
    assert.match(reply, /^Nice idea/);
    assert.ok(reply.includes(events[0].snapshot.question), "the engine appends the question the model forgot");
    assert.equal(events.at(-1).type, "done");
  } finally {
    server.close();
  }
});

test("who the users are doesn't change the kind of app ('medical students' ≠ health app)", () => {
  const s = snapshot({
    idea: "A note-taking app for university students",
    users: "First-year medical students at UNILAG who struggle to keep up in fast lectures",
  });
  assert.deepEqual(s.blueprint.buildPlan.useCase.ids, ["study-notes"]);
  assert.ok(!s.brief.features.value.some((f) => /112|health/i.test(f)));
});

test("the reply prompt asks N-ATLAS not to repeat earlier replies", () => {
  const { prompt } = replyPrompt(snapshot({ idea: "A note app" }), [{ role: "user", content: "A note app" }]);
  assert.match(prompt, /do not repeat or re-summarise/);
});

test("long replies are cut after two sentences and the model is stopped", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { designRouter } = await import("../backend/src/routes/design.ts");
  const { endOfSentence } = await import("../backend/src/design/interview.ts");
  assert.equal(endOfSentence("One. Two! Three?", 2), 9);
  assert.equal(endOfSentence("Version 2.5 is out. Next", 2), -1, "decimal points are not sentence ends");

  let sentAfterStop = 0;
  const provider = {
    name: "scripted", isMock: true,
    async generate() { throw new Error("unused"); },
    async generateStream(_p: string, _o: unknown, onChunk: (c: any) => void, signal?: AbortSignal) {
      for (const d of ["Great idea. ", "Students will love it. ", "It can summarise. ", "It can also quiz. ", "And more."]) {
        if (signal?.aborted) { sentAfterStop++; return; }
        onChunk({ type: "delta", delta: d });
      }
    },
    async health() { return { ok: true } as any; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api", designRouter(provider as any));
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/design/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: { idea: "A note app" }, history: [{ role: "user", content: "A note app" }] }),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    const reply = events.filter((e) => e.type === "delta").map((e) => e.delta).join("");
    const question = events[0].snapshot.question;
    assert.equal(reply, "Great idea. Students will love it.\n\n" + question);
    assert.equal(sentAfterStop, 1, "generation stops once the reply is long enough");
  } finally {
    server.close();
  }
});

test("in a project's language, N-ATLAS replies in it and asks the engine's question in it", () => {
  const s = snapshot({ idea: "A note app for students" });
  // The developer writes in English, but the project is in Yoruba.
  const { system, prompt } = replyPrompt(s, [{ role: "user", content: "A note app for students" }], "yo");
  assert.match(system, /Reply in Yoruba\./);
  assert.match(prompt, /asking this question, in Yoruba:/);
  assert.ok(prompt.includes(s.question));
  // English projects keep the exact-question instruction.
  assert.match(replyPrompt(s, [{ role: "user", content: "A note app" }], "en").prompt, /end with exactly this question/);
});

test("translated questions are tidied: no quotes, labels or trailing notes", async () => {
  const { cleanTranslation } = await import("../backend/src/routes/design.ts");
  assert.equal(cleanTranslation('Translation: "Ta ni yóò lò ó?"\n\n(Note: informal)'), "Ta ni yóò lò ó?");
  assert.equal(cleanTranslation("  “Wa ake yi wa?”  "), "Wa ake yi wa?");
});

async function designTurn(body: unknown, reply: (prompt: string, system?: string) => string) {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { designRouter } = await import("../backend/src/routes/design.ts");
  const calls: { prompt: string; system?: string }[] = [];
  const provider = {
    name: "scripted", isMock: true,
    async generate() { throw new Error("unused"); },
    async generateStream(p: string, o: { system?: string }, onChunk: (c: any) => void) {
      calls.push({ prompt: p, system: o.system });
      onChunk({ type: "delta", delta: reply(p, o.system) });
    },
    async health() { return { ok: true } as any; },
  };
  const app = express();
  app.use(express.json());
  app.use("/api", designRouter(provider as any));
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/design/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    return { events, calls, text: events.filter((e) => e.type === "delta").map((e) => e.delta).join("") };
  } finally {
    server.close();
  }
}

test("a Hausa project opens with the first question translated by N-ATLAS, plus the English original", async () => {
  const { events, calls, text } = await designTurn({ answers: {}, history: [], language: "ha" }, () => "Me kake son ginawa?");
  assert.equal(calls.length, 1);
  assert.match(calls[0].system ?? "", /Hausa/);
  assert.equal(text, "Me kake son ginawa?");
  const q = events.find((e) => e.type === "question");
  assert.ok(q && /What would you like to build/.test(q.english));

  // Translations are cached: the same opening question doesn't call N-ATLAS again.
  const again = await designTurn({ answers: {}, history: [], language: "ha" }, () => "should not be used");
  assert.equal(again.calls.length, 0);
  assert.equal(again.text, "Me kake son ginawa?");
});

test("when a non-English reply forgets to ask, the question is translated and appended", async () => {
  const { text, calls } = await designTurn(
    { answers: { idea: "A note app for students" }, history: [{ role: "user", content: "A note app for students" }], language: "ig" },
    (_p, system) => (/translate/i.test(system ?? "") ? "Onye ga-eji ya?" : "Echiche dị mma."),
  );
  assert.equal(calls.length, 2, "the reply, then a translation of the question");
  assert.equal(text, "Echiche dị mma.\n\nOnye ga-eji ya?");
});
