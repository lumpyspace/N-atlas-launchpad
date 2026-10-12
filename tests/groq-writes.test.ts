/**
 * "Groq writes, N-ATLAS translates": the app's instructions, the build guide,
 * and the page helper — with the template / N-ATLAS alone as fallbacks.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Brain, type BrainProvider } from "../backend/src/brain/brain.ts";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { cleanPrompt, writeSystemPrompt } from "../backend/src/blueprint/promptWriter.ts";
import { helperSystem, parseHelpContext } from "../backend/src/help/helper.ts";

const groq: BrainProvider = { name: "Groq", baseURL: "https://groq.test/v1", model: "m", apiKey: "k" };

/** A fake assistant model answering every request with `reply(body)`. */
function brainSaying(reply: (body: any) => string, seen: any[] = []) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    seen.push(body);
    return new Response(JSON.stringify({ choices: [{ message: { content: reply(body) } }] }));
  }) as typeof fetch;
  return new Brain([groq], 500, fetchImpl);
}

const PROMPT = `You are Kano Price Helper, a market-price assistant for farmers and traders in Kano.
You help:
- Give today's price for an item in a named market
- Convert between local units (mudu, bag) and kilograms
How to answer: short, friendly and practical; money in naira (₦).
When you don't have a price or a fact, say "I don't have that information" — never guess.
Reply in the user's language: Hausa, Nigerian English or Pidgin.
Stay on market prices; for anything else, say what you can help with.`;

test("Groq writes the app's instructions; the security rules and reference code are still added", async () => {
  const bp = generateBlueprint("A WhatsApp assistant that tells farmers in Kano the market prices of crops") as any;
  const code = bp.systemPrompt.match(/reference code ([A-Z0-9-]+)/)[1];
  const seen: any[] = [];
  const r = await writeSystemPrompt(bp, brainSaying(() => PROMPT, seen));
  assert.equal(r?.by, "Groq");
  assert.match(r!.prompt, /^You are Kano Price Helper/);
  assert.match(r!.prompt, new RegExp(`reference code ${code}`), "the planted code survives, so leak checks keep working");
  assert.match(r!.prompt, /SECURITY DIRECTIVES/);
  assert.match(seen[0].messages[1].content, /Do NOT add security rules/);
  // Unusable text (too short, not a prompt) → the template is kept.
  assert.equal(cleanPrompt("Sure! Here you go.", "X"), null);
  assert.equal(await writeSystemPrompt(bp, brainSaying(() => "Sure!")), null);
});

test("the blueprint route uses Groq's prompt, or the template when asked (or when Groq fails)", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { blueprintRouter } = await import("../backend/src/routes/blueprint.ts");
  const app = express();
  app.use(express.json());
  app.use("/api", blueprintRouter(brainSaying(() => PROMPT)));
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/blueprint`;
    const post = (body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    const written = await post({ description: "A chat assistant for crop prices in Kano" });
    assert.equal(written.promptBy, "Groq");
    const template = await post({ description: "A chat assistant for crop prices in Kano", promptBy: false });
    assert.equal(template.promptBy, undefined);
    assert.doesNotMatch(template.systemPrompt, /Kano Price Helper/);
  } finally {
    server.close();
  }
});

test("Groq writes the build guide; N-ATLAS puts it in Hausa; each section says who did what", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { narrateRouter } = await import("../backend/src/routes/narrate.ts");
  const bp = generateBlueprint("A chat assistant that tells farmers in Kano the market prices of crops") as any;
  const brain = brainSaying((body) => {
    const ask = body.messages[1].content as string;
    if (ask.includes("one message a real user would send")) return "User: What is the price of maize today?\nApp: Maize is … per bag at Dawanau today.";
    if (ask.includes("give the feature's name")) return "Price lookup: Answer from the owner's daily price table only.";
    if (ask.includes("In one short phrase")) return "Farmers and traders in Kano";
    if (/List \d/.test(ask)) return "- Keep prices from the owner's table\n- Say when a price is missing";
    return "It helps farmers and traders in Kano check crop prices before they sell.";
  });
  // N-ATLAS translates every line into (fake) Hausa, keeping markers and numbers.
  const natlas = {
    name: "fake",
    isMock: true,
    async generate() {
      throw new Error("unused");
    },
    async generateStream(prompt: string, _o: unknown, onChunk: (c: any) => void) {
      const body = prompt.split("\n").slice(1).join(" ");
      onChunk({ type: "delta", delta: `Wannan shine fassarar Hausa ta jumlar da aka bayar, ba tare da canza komai ba: ${body.length}` });
    },
    async health() {
      return { ok: true } as any;
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api", narrateRouter(natlas as any, brain));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/blueprint/narrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint: bp, language: "ha", sections: ["purpose", "conversation", "mvp"] }),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    const sections = events.filter((e) => e.type === "section");
    assert.equal(sections.length, 3);
    for (const s of sections) assert.deepEqual(s.by, { brain: "Groq", voice: "N-ATLAS" }, s.section);
    const convo = sections.find((s) => s.section === "conversation");
    assert.ok(convo.value?.user && convo.value?.app, "the User:/App: shape survives translation");
  } finally {
    server.close();
  }
});

test("the page helper knows the page, the mode and where the project stands", () => {
  const ctx = parseHelpContext({
    page: "Try it",
    mode: "simple",
    project: { name: "Kano Prices", kind: "Market prices", stages: [{ label: "Your information", done: false, detail: "Your app needs facts" }], next: "Add the facts your assistant should answer from." },
  });
  const system = helperSystem(ctx);
  assert.match(system, /They are on the page: Try it/);
  assert.match(system, /"Kano Prices" \(Market prices\)/);
  assert.match(system, /Your information: not done/);
  assert.match(system, /use the Simple-mode names/);
  assert.match(system, /Never ask for passwords or API keys/);
  assert.equal(parseHelpContext(null).page, "Home");
});

test("the helper route answers with the assistant model, in English directly", async () => {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { helpRouter } = await import("../backend/src/routes/help.ts");
  const seen: any[] = [];
  const app = express();
  app.use(express.json());
  app.use("/api", helpRouter({} as any, brainSaying(() => "Open **Your information** in the menu and upload your price list.", seen)));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/help/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: [{ role: "user", content: "What next?" }], language: "en", context: { page: "Try it", mode: "simple" } }),
    });
    const events = (await res.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)));
    assert.match(events.filter((e) => e.type === "delta").map((e) => e.delta).join(""), /Your information/);
    assert.ok(events.some((e) => e.type === "via" && e.voice === "Groq"));
    assert.match(seen[0].messages[0].content, /They are on the page: Try it/);
  } finally {
    server.close();
  }
});
