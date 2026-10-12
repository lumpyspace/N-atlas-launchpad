import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, completeSentences, providersFromEnv, retryAfterMs, type BrainProvider } from "../backend/src/brain/brain.ts";
import { inLanguage, keepsNumbers, relay, speakIn, type RelayEvent } from "../backend/src/brain/relay.ts";

const gemini: BrainProvider = { name: "Gemini", baseURL: "https://gemini.test/v1beta/openai", model: "gemini-2.5-flash", apiKey: "k1" };
const groq: BrainProvider = { name: "Groq", baseURL: "https://groq.test/openai/v1", model: "gpt-oss", apiKey: "k2" };

/** A fake OpenAI-compatible fetch: per-host replies (string) or HTTP status (number). */
function fakeFetch(plan: Record<string, string | number | ((body: any) => string)>, calls: { host: string; body: any }[] = []) {
  return (async (url: string, init: RequestInit) => {
    const host = new URL(url).host;
    const body = JSON.parse(String(init.body));
    calls.push({ host, body });
    const p = plan[host];
    if (typeof p === "number") return new Response("limit", { status: p });
    const text = typeof p === "function" ? p(body) : p;
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
  }) as typeof fetch;
}

/** A fake N-ATLAS provider: maps prompt text to replies, streamed. */
function fakeNatlas(reply: (prompt: string, system?: string) => string) {
  const prompts: string[] = [];
  return {
    prompts,
    provider: {
      name: "fake",
      isMock: true,
      async generate() {
        throw new Error("unused");
      },
      async generateStream(prompt: string, o: { system?: string }, onChunk: (c: any) => void) {
        prompts.push(prompt);
        for (const w of reply(prompt, o.system).split(/(?<= )/)) onChunk({ type: "delta", delta: w });
      },
      async health() {
        return { ok: true } as any;
      },
    },
  };
}

test("brain: providers come from the environment, in order; keys never appear in the status", () => {
  const ps = providersFromEnv({ GEMINI_API_KEY: "secret-g", GROQ_API_KEY: "secret-q" } as any);
  assert.deepEqual(ps.map((p) => `${p.name}/${p.model}`), ["Groq/openai/gpt-oss-120b", "Groq/qwen/qwen3.8-27b", "Groq/openai/gpt-oss-20b", "Gemini/gemini-3.8-flash", "Gemini/gemini-3.5-flash"]);
  const geminiFirst = providersFromEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", BRAIN_ORDER: "gemini,groq" } as any);
  assert.deepEqual(geminiFirst.map((p) => p.name), ["Gemini", "Gemini", "Groq", "Groq", "Groq"]);
  assert.deepEqual(providersFromEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.7-flash" } as any).map((p) => p.model), ["gemini-3.7-flash"]);
  assert.equal(ps[3].baseURL, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(providersFromEnv({} as any).length, 0);
  const status = JSON.stringify(new Brain(ps).status());
  assert.ok(!status.includes("secret"), "no keys in the status");
});

test("brain: falls through to the next provider, rests one out of quota, keeps a daily budget", async () => {
  let t = Date.parse("2026-10-12T10:00:00Z");
  const calls: { host: string; body: any }[] = [];
  const brain = new Brain([gemini, groq], 3, fakeFetch({ "gemini.test": 429, "groq.test": "From Groq" }, calls), () => t);
  const r = await brain.chat([{ role: "user", content: "hi" }]);
  assert.deepEqual([r.text, r.provider], ["From Groq", "Groq"]);
  assert.ok(brain.status().providers[0].coolingDownUntil, "Gemini rests after a 429");
  await brain.chat([{ role: "user", content: "again" }]);
  assert.equal(calls.filter((c) => c.host === "gemini.test").length, 1, "not retried while resting");
  // Budget: 3 attempts a day (the 429 counted too).
  assert.equal(brain.available(), false);
  await assert.rejects(brain.chat([{ role: "user", content: "x" }]), /budget/);
  t += 24 * 3600_000; // a new day
  assert.equal(brain.available(), true);
  assert.equal(new Brain([]).available(), false);
});

test("relay checks: numbers survive translation; language must match", () => {
  assert.equal(keepsNumbers("Rice is N82,000 and delivery is N1,500.", "Shinkafa N82000 ce, kawo N1,500."), true);
  assert.equal(keepsNumbers("Rice is N82,000.", "Shinkafa N85,000 ce."), false);
  assert.equal(inLanguage("Wannan manhaja tana taimaka wa ɗalibai su yi karatu sosai kuma su gane darussa.", "ha"), true);
  assert.equal(inLanguage("This app helps students study their notes and understand lessons well.", "ha"), false);
  assert.equal(inLanguage("Ok", "yo"), true, "too short to judge");
});

test("relay: N-ATLAS reads the words, the brain thinks in English, N-ATLAS says it in Hausa", async () => {
  const calls: { host: string; body: any }[] = [];
  const brain = new Brain([gemini], 50, fakeFetch({ "gemini.test": "Great idea. Rice costs N82,000 per bag. Who will use it?" }, calls));
  const natlas = fakeNatlas((p) =>
    p.startsWith("Translate into English")
      ? "I want an app for selling rice."
      : "Kyakkyawan ra'ayi ne. Shinkafa tana kai N82,000 kowace buhu. Su wa za su yi amfani da ita?",
  );
  const events: RelayEvent[] = [];
  const r = await relay({
    brain,
    natlas: natlas.provider as any,
    language: "ha",
    messages: [
      { role: "system", content: "You are the design assistant." },
      { role: "user", content: "Ina son manhaja don sayar da shinkafa." },
    ],
    words: "Ina son manhaja don sayar da shinkafa.",
    onEvent: (e) => events.push(e),
  });
  assert.equal(r.voice, "N-ATLAS");
  assert.equal(r.brain, "Gemini");
  assert.match(r.text, /Shinkafa tana kai N82,000/);
  assert.equal(events[0].type, "understood");
  // The brain saw the exact words and N-ATLAS's reading, and was told N-ATLAS will translate.
  const sent = JSON.stringify(calls[0].body.messages);
  assert.match(sent, /N-ATLAS read them as/);
  assert.match(sent, /N-ATLAS will translate your reply into Hausa/);
  const streamed = events.filter((e) => e.type === "delta").map((e: any) => e.delta).join("");
  assert.equal(streamed.trim(), r.text);
});

test("relay: a translation that changes a price is redone, then the brain writes it itself", async () => {
  const brain = new Brain([gemini], 50, fakeFetch({
    "gemini.test": (body) =>
      body.messages[0].content.startsWith("You translate") ? "Shinkafa N82,000 ce a kowace buhu, kuma muna kawo ta gida." : "Rice is N82,000 per bag and we deliver it home.",
  }));
  const natlas = fakeNatlas((p) => (p.startsWith("Translate into English") ? "Rice price?" : "Shinkafa N85,000 ce a kowace buhu, kuma muna kawo ta gida."));
  const events: RelayEvent[] = [];
  const r = await relay({
    brain,
    natlas: natlas.provider as any,
    language: "ha",
    messages: [{ role: "system", content: "s" }, { role: "user", content: "Nawa ne shinkafa?" }],
    words: "Nawa ne shinkafa?",
    onEvent: (e) => events.push(e),
  });
  assert.equal(r.voice, "Gemini", "N-ATLAS changed the price twice, so the brain's own Hausa is used");
  assert.match(r.text, /N82,000/);
  assert.equal(events.filter((e) => e.type === "reset").length, 2);
});

test("relay: English needs no translating", async () => {
  const brain = new Brain([gemini], 50, fakeFetch({ "gemini.test": "Who will use it?" }));
  const natlas = fakeNatlas(() => {
    throw new Error("N-ATLAS shouldn't be called");
  });
  const r = await relay({ brain, natlas: natlas.provider as any, language: "en", messages: [{ role: "system", content: "s" }, { role: "user", content: "An app" }], words: "", onEvent: () => {} });
  assert.deepEqual([r.text, r.voice], ["Who will use it?", "Gemini"]);
});

async function designTurn(brain: Brain, natlasReply: (p: string, s?: string) => string, body: unknown) {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { designRouter } = await import("../backend/src/routes/design.ts");
  const natlas = fakeNatlas(natlasReply);
  const app = express();
  app.use(express.json());
  app.use("/api", designRouter(natlas.provider as any, brain));
  const server = app.listen(0);
  try {
    const { port } = server.address() as import("node:net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/design/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    return { events, text: events.filter((e) => e.type === "delta").map((e) => e.delta).join(""), natlas };
  } finally {
    server.close();
  }
}

test("design chat with a brain: Gemini thinks, N-ATLAS speaks Yoruba; English shown on request", async () => {
  const brain = new Brain([gemini], 50, fakeFetch({ "gemini.test": "A study app is a good fit for N-ATLAS. Who exactly will use it, and where are they?" }));
  const { events, text } = await designTurn(
    brain,
    (p) => (p.startsWith("Translate into English") ? "A note app for students" : "Ohun èlò ẹ̀kọ́ dára fún N-ATLAS. Ta ni yóò lò ó, níbo ni wọ́n wà?"),
    { answers: { idea: "Ohun èlò àkọsílẹ̀ fún àwọn akẹ́kọ̀ọ́" }, history: [{ role: "user", content: "Ohun èlò àkọsílẹ̀ fún àwọn akẹ́kọ̀ọ́" }], language: "yo" },
  );
  assert.match(text, /Ta ni yóò lò ó/);
  assert.ok(events.some((e) => e.type === "via" && e.voice === "N-ATLAS" && e.brain === "Gemini"));
  assert.ok(events.some((e) => e.type === "question" && /Who exactly will use it/.test(e.english)));
  assert.ok(events.some((e) => e.type === "understood"));
});

test("design chat: if the brain fails, N-ATLAS answers on its own and says so", async () => {
  const brain = new Brain([gemini], 50, fakeFetch({ "gemini.test": 500 }));
  const { events, text } = await designTurn(brain, () => "A good idea. Who exactly will use it, and where are they?", {
    answers: { idea: "A note app for students" },
    history: [{ role: "user", content: "A note app for students" }],
    language: "en",
  });
  assert.ok(events.some((e) => e.type === "warning" && /N-ATLAS answered on its own/.test(e.message)));
  assert.match(text, /Who exactly will use it/);
});

test("brain: a busy model is retried once; a cut-off reply keeps its complete sentences; thinking gets its own tokens", async () => {
  assert.equal(completeSentences("Helping farmers is good. It saves money. Who is a"), "Helping farmers is good. It saves money.");
  assert.equal(completeSentences("No full stop here"), "");
  const bodies: any[] = [];
  let n = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    if (n++ === 0) return new Response("busy", { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "A good idea. Who will use it? They" }, finish_reason: "length" }] }), { status: 200 });
  }) as typeof fetch;
  const [g] = providersFromEnv({ GEMINI_API_KEY: "k" } as any);
  const brain = new Brain([g], 50, fetchImpl, Date.now, 0);
  const r = await brain.chat([{ role: "user", content: "hi" }], { maxTokens: 300 });
  assert.equal(r.text, "A good idea. Who will use it?");
  assert.equal(bodies.length, 2, "retried after the 503");
  assert.equal(bodies[0].max_tokens, 300 + 1024);
  assert.equal(bodies[0].reasoning_effort, "low");
});

test("a rate-limited provider rests as long as it asks, at most a minute", () => {
  assert.equal(retryAfterMs("Rate limit reached … Please try again in 3.9375s. Need more tokens?"), 4438);
  assert.equal(retryAfterMs("Please try again in 1m30s"), 60_000);
  assert.equal(retryAfterMs("quota exceeded"), 60_000);
});

test("Yoruba, Hausa and Igbo go only to models good at them; English work may use any", async () => {
  const small: BrainProvider = { name: "Groq", baseURL: "https://small.test/v1", model: "small", apiKey: "k3", nigerian: false };
  const calls: { host: string; body: any }[] = [];
  const brain = new Brain([groq, small], 50, fakeFetch({ "groq.test": 503, "small.test": "From the small model" }, calls), Date.now, 0);
  assert.equal((await brain.chat([{ role: "user", content: "Write the page" }])).text, "From the small model");
  calls.length = 0;
  await assert.rejects(brain.chat([{ role: "user", content: "Translate into Yoruba: …" }], { nigerian: true }));
  assert.ok(!calls.some((c) => c.host === "small.test"), "the small model never writes Yoruba");
  const ps = providersFromEnv({ GROQ_API_KEY: "q" } as any);
  assert.deepEqual(ps.map((p) => p.nigerian !== false), [true, false, false]);
});

test("no assistant model free: a reply keeps its facts (English lines) instead of failing", async () => {
  const busy = new Brain([groq], 50, fakeFetch({ "groq.test": 429 }), Date.now, 0);
  // N-ATLAS drops the price every time, so each line fails its checks.
  const natlas = {
    name: "fake",
    isMock: true,
    async generate() {
      return { text: "", model: "fake", latencyMs: 1 } as any;
    },
    async generateStream(_p: string, _o: unknown, onChunk: (c: any) => void) {
      onChunk({ type: "delta", delta: "Buhun shinkafa yana da tsada sosai a kasuwa yau" });
    },
    async health() {
      return { ok: true } as any;
    },
  };
  const said = await speakIn({ brain: busy, natlas: natlas as any, language: "ha", english: "A 50 kg bag of rice is ₦82,000.", brainName: "Groq" });
  assert.match(said.text, /₦82,000/);
});

test("plain English work goes to the smaller models first, saving the strong one for Nigerian languages", async () => {
  const small: BrainProvider = { name: "Groq", baseURL: "https://small.test/v1", model: "small", apiKey: "k3", nigerian: false };
  const calls: { host: string; body: any }[] = [];
  const brain = new Brain([groq, small], 50, fakeFetch({ "groq.test": "strong", "small.test": "small" }, calls));
  assert.equal((await brain.chat([{ role: "user", content: "Decide the answer" }], { english: true })).text, "small");
  assert.equal((await brain.chat([{ role: "user", content: "Write the site" }])).text, "strong");
});
