/**
 * Published assistants: Groq sets them up from building blocks, visitors talk
 * to them at /a/<slug> (N-ATLAS reads and speaks, Groq decides), orders land
 * in the owner's inbox, and only the owner's key can change them.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Brain, type BrainProvider } from "../backend/src/brain/brain.ts";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { MemoryStore, UpstashStore } from "../backend/src/sites/store.ts";
import { factsFor, leaks, parseReply, visitorLanguage } from "../backend/src/sites/runtime.ts";
import { publicView, sanitizeConfig } from "../backend/src/sites/sanitize.ts";

const groq: BrainProvider = { name: "Groq", baseURL: "https://groq.test/v1", model: "m", apiKey: "k" };

function brainSaying(reply: (body: any) => string, seen: any[] = []) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    seen.push(body);
    return new Response(JSON.stringify({ choices: [{ message: { content: reply(body) } }] }));
  }) as typeof fetch;
  return new Brain([groq], 500, fetchImpl);
}

/** N-ATLAS: reads Hausa as English, and "translates" by prefixing Hausa words. */
const natlas = {
  name: "fake",
  isMock: true,
  async generate(prompt: string) {
    return { text: `N-ATLAS alone: ${prompt.length}`, model: "fake", latencyMs: 1 } as any;
  },
  async generateStream(prompt: string, _o: unknown, onChunk: (c: any) => void) {
    const body = prompt.split("\n").slice(1).join(" ");
    // Hausa words only, keeping the numbers and code markers, as the checks require.
    const kept = (body.match(/\[\[C\d+\]\]|\d[\d,.]*\d|\d/g) ?? []).join(" ");
    const out = prompt.startsWith("Translate into English") ? "How much is a bag of rice?" : `Ga amsar da Hausa sosai kuma muna farin cikin taimaka maka a yau ${kept}`;
    onChunk({ type: "delta", delta: out });
  },
  async health() {
    return { ok: true } as any;
  },
};

const config = () =>
  sanitizeConfig({
    name: "Kano Grains",
    tagline: "Grain prices at Dawanau market.",
    greeting: "Hello! Ask me about grain prices or place an order.",
    language: "en",
    instructions: "You are Kano Grains, a friendly assistant for a grain shop at Dawanau market in Kano.",
    blocks: {
      info: { on: true, text: "Opening hours: 8am to 6pm, Monday to Saturday.\nAddress: Shop 12, Dawanau market." },
      prices: { on: true, items: [{ name: "Rice", unit: "bag (50 kg)", price: 82000 }, { name: "Maize", unit: "bag (100 kg)", price: null }] },
      orders: { on: true, kind: "order", fields: ["name", "phone number", "item", "quantity"] },
      contact: { on: true, whatsapp: "+2348012345678", phone: "", hours: "8am–6pm" },
    },
  })!;

test("a config from a browser is cleaned, and always carries the security rules and a reference code", () => {
  const c = config();
  assert.match(c.instructions, /SECURITY DIRECTIVES/);
  assert.match(c.instructions, /reference code [A-Z0-9-]+/);
  assert.equal(c.blocks.prices.items[1].price, null);
  assert.equal(sanitizeConfig({ name: "" }), null);
  const view = publicView("kano-grains-abc123", c);
  assert.ok(!JSON.stringify(view).includes("SECURITY"), "visitors never see the instructions");
  assert.equal(view.contact?.whatsapp, "+2348012345678");
});

test("the facts are the owner's blocks only; an unpriced item is never given a price", () => {
  const facts = factsFor(config());
  assert.match(facts, /Rice \(bag \(50 kg\)\): ₦82,000/);
  assert.match(facts, /Maize \(bag \(100 kg\)\): price not set/);
  assert.match(facts, /collect these details, one or two at a time: name, phone number, item, quantity/);
  assert.match(facts, /WhatsApp \+2348012345678/);
  assert.deepEqual(parseReply('Sure:\n```json\n{"reply":"Rice is ₦82,000.","order":null}\n```'), { reply: "Rice is ₦82,000." });
  assert.equal(leaks(config(), `My code is ${config().instructions.match(/reference code ([A-Z0-9-]+)/)![1]}`), true);
  assert.equal(visitorLanguage("Nawa ne buhun shinkafa?", "en"), "ha");
});

async function withApp(store: MemoryStore | null, reply: (body: any) => string, fn: (call: (method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body: any }>) => Promise<void>, env: Record<string, string> = {}) {
  const express = (await import("../backend/node_modules/express/index.js")).default;
  const { sitesRouter } = await import("../backend/src/routes/sites.ts");
  const app = express();
  app.use(express.json());
  app.use("/api", sitesRouter(natlas as any, brainSaying(reply), store, { publicMode: env.PUBLIC === "1", dailyLimit: Number(env.LIMIT ?? 300) }));
  const s = app.listen(0);
  try {
    const port = (s.address() as AddressInfo).port;
    await fn(async (method, path, body, key) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method,
        headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    });
  } finally {
    s.close();
  }
}

test("publish → visitors chat in Hausa → a confirmed order lands in the owner's inbox, once", async () => {
  const store = new MemoryStore();
  let turn = 0;
  await withApp(store, () => {
    turn++;
    return turn === 1
      ? '{"reply": "A bag of rice (50 kg) is ₦82,000. Would you like to order?", "order": null}'
      : '{"reply": "Thank you, Musa! Your order for 2 bags of rice is sent; the shop will call you.", "order": {"fields": {"name": "Musa", "phone number": "08031234567", "item": "Rice", "quantity": "2 bags"}, "complete": true}}';
  }, async (call) => {
    const pub = await call("POST", "/sites", { config: config() });
    assert.equal(pub.status, 200);
    const { slug, ownerKey } = pub.body;
    assert.match(slug, /^kano-grains-[0-9a-f]{6}$/);

    const info = await call("GET", `/sites/${slug}/public`);
    assert.equal(info.body.name, "Kano Grains");
    assert.equal(info.body.instructions, undefined);

    const a1 = await call("POST", `/sites/${slug}/chat`, { history: [{ role: "user", content: "Nawa ne buhun shinkafa?" }] });
    assert.equal(a1.body.language, "ha");
    assert.equal(a1.body.voice, "N-ATLAS");
    assert.match(a1.body.reply, /^Ga amsar da Hausa sosai/);
    assert.match(a1.body.english, /₦82,000/);

    const history = [
      { role: "user", content: "Nawa ne buhun shinkafa?" },
      { role: "assistant", content: a1.body.english },
      { role: "user", content: "Ina son buhu biyu. Sunana Musa, lambata 08031234567. Na tabbatar." },
    ];
    const a2 = await call("POST", `/sites/${slug}/chat`, { history });
    assert.deepEqual(a2.body.order, { saved: true });
    // The same order confirmed again in the same conversation isn't saved twice.
    await call("POST", `/sites/${slug}/chat`, { history, sent: [a2.body.orderKey] });

    assert.equal((await call("GET", `/sites/${slug}/inbox`)).status, 403, "no key, no inbox");
    assert.equal((await call("GET", `/sites/${slug}/inbox`, undefined, "wrong-key")).status, 403);
    const inbox = await call("GET", `/sites/${slug}/inbox`, undefined, ownerKey);
    assert.equal(inbox.body.items.length, 1);
    assert.deepEqual(inbox.body.items[0].fields, { name: "Musa", "phone number": "08031234567", item: "Rice", quantity: "2 bags" });
    assert.equal(inbox.body.items[0].language, "ha");

    // Only the owner can change or remove it.
    const changed = { ...config(), tagline: "New tagline" };
    assert.equal((await call("PUT", `/sites/${slug}`, { config: changed }, "wrong-key")).status, 403);
    assert.equal((await call("PUT", `/sites/${slug}`, { config: changed }, ownerKey)).status, 200);
    assert.equal((await call("GET", `/sites/${slug}/public`)).body.tagline, "New tagline");
    assert.equal((await call("DELETE", `/sites/${slug}`, undefined, ownerKey)).status, 200);
    assert.equal((await call("GET", `/sites/${slug}/public`)).status, 404);
  });
});

test("preview answers without saving; a daily limit protects the host; no database, no publishing", async () => {
  const store = new MemoryStore();
  await withApp(store, () => '{"reply": "Done!", "order": {"fields": {"name": "Ada"}, "complete": true}}', async (call) => {
    const p = await call("POST", "/sites/preview", { config: config(), history: [{ role: "user", content: "I want rice. I'm Ada. Yes, confirm." }] });
    assert.equal(p.body.reply, "Done!");
    assert.ok(p.body.order, "the preview shows the order it would save");
    const { slug } = (await call("POST", "/sites", { config: config() })).body;
    assert.equal((await call("POST", `/sites/${slug}/chat`, { history: [{ role: "user", content: "hi" }] })).status, 200);
    assert.equal((await call("POST", `/sites/${slug}/chat`, { history: [{ role: "user", content: "hi again" }] })).status, 429);
    assert.equal((await call("POST", `/sites/${slug}/chat`, { history: [{ role: "user", content: "x".repeat(1001) }] })).status, 400);
  }, { LIMIT: "1" });
  await withApp(null, () => "{}", async (call) => {
    assert.equal((await call("GET", "/sites/status")).body.canPublish, false);
    assert.equal((await call("POST", "/sites", { config: config() })).status, 503);
  });
});

test("Upstash store speaks Redis over REST", async () => {
  const calls: string[][] = [];
  const db = new Map<string, string>();
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const cmd = JSON.parse(String(init.body)) as string[];
    calls.push(cmd);
    let result: unknown = null;
    if (cmd[0] === "SET") db.set(cmd[1], cmd[2]);
    if (cmd[0] === "GET") result = db.get(cmd[1]) ?? null;
    if (cmd[0] === "INCR") result = 1;
    return new Response(JSON.stringify({ result }));
  }) as typeof fetch;
  const s = new UpstashStore("https://db.test", "t", fetchImpl);
  const c = config();
  await s.putSite({ slug: "a", config: c, ownerKeyHash: "h", createdAt: "", updatedAt: "" });
  assert.equal((await s.getSite("a"))?.config.name, "Kano Grains");
  assert.equal(await s.countUse("site:a", "2026-10-12"), 1);
  assert.deepEqual(calls.map((c) => c[0]), ["SET", "GET", "INCR", "EXPIRE"]);
});
