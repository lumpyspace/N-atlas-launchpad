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
