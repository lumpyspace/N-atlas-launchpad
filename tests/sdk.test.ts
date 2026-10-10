import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
// @ts-expect-error — plain JS module with a hand-written .d.ts next to it
import * as sdk from "../sdk/js/natlas.js";

const { Natlas, Knowledge, NatlasError, fitContext, detectLanguage, estimateTokens } = sdk;

/** A fake OpenAI-compatible N-ATLAS server that records what it was sent. */
let server: Server;
let base = "";
const seen: any[] = [];
let failNext = 0;

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url === "/missing/v1/chat/completions") {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: 'model "n-atlas" not found, try pulling it first' } }));
      }
      if (req.url === "/slow/v1/chat/completions") return; // never answers
      if (failNext > 0) {
        failNext--;
        res.writeHead(503);
        return res.end("busy");
      }
      const body = JSON.parse(raw);
      seen.push({ body, auth: req.headers.authorization });
      const reply = "Ẹ káàárọ̀! How I fit help you today?";
      if (!body.stream) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            model: body.model,
            choices: [{ message: { role: "assistant", content: reply }, finish_reason: "stop" }],
            usage: { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 },
          }),
        );
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const word of reply.split(/(?<= )/)) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29 } })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test("sdk: chat sends N-ATLAS defaults, language hint and the API key", async () => {
  const natlas = new Natlas({ baseURL: `${base}/v1/`, apiKey: "test-key" });
  const r = await natlas.chat("How I fit register my business?", { system: "You help small traders.", language: "pid" });
  const { body, auth } = seen.at(-1);
  assert.equal(body.model, "n-atlas");
  assert.equal(body.temperature, 0.1);
  assert.equal(body.repetition_penalty, 1.12);
  assert.equal(body.messages[0].content, "You help small traders. Respond in Nigerian Pidgin.");
  assert.equal(body.messages[1].content, "How I fit register my business?");
  assert.equal(auth, "Bearer test-key");
  assert.match(r.text, /káàárọ̀/);
  assert.deepEqual(r.usage, { promptTokens: 20, completionTokens: 9, totalTokens: 29 });
  assert.equal(r.finishReason, "stop");
});

test("sdk: knowledge adds the best passages and returns them as sources", async () => {
  const kb = new Knowledge();
  kb.add("prices.txt", "Mile 12 market prices\n\nRice, local, 50kg bag: N78,000\n\nBeans, oloyin, paint bucket: N9,500");
  kb.add("notes.md", "Enzymes are biological catalysts. Competitive inhibitors bind the active site.");
  const natlas = new Natlas({ baseURL: `${base}/v1` });
  const r = await natlas.chat("How much is a bag of rice?", { knowledge: kb, k: 1 });
  assert.equal(r.sources.length, 1);
  assert.equal(r.sources[0].source, "prices.txt");
  const system = seen.at(-1).body.messages[0].content;
  assert.match(system, /Answer only from these facts/);
  assert.match(system, /\[prices\.txt — passage 1\]/);
  assert.doesNotMatch(system, /Enzymes/);

  // Nothing relevant: no facts block, no sources.
  const none = await natlas.chat("Who won the match?", { knowledge: kb });
  assert.equal(none.sources.length, 0);
  assert.equal(seen.at(-1).body.messages[0]?.role, "user");
});

test("sdk: Knowledge.fromJSON reads Launchpad exports and project documents", () => {
  const exported = Knowledge.fromJSON(JSON.stringify([{ source: "a.txt", index: 2, text: "Ọjà Ọba sells àdìrẹ" }]));
  assert.equal(exported.search("oja oba adire")[0].index, 2); // accent-insensitive
  const project = Knowledge.fromJSON([{ name: "b.txt", chunks: [{ text: "first" }, { text: "inhibition of enzymes" }] }]);
  assert.deepEqual(project.search("inhibitors").map((h: any) => [h.source, h.index]), [["b.txt", 2]]);
});

test("sdk: stream yields deltas and resolves usage on done", async () => {
  const natlas = new Natlas({ baseURL: `${base}/v1` });
  const s = natlas.stream([
    { role: "system", content: "Be brief." },
    { role: "user", content: "Hello" },
  ]);
  let text = "";
  for await (const d of s) text += d;
  const done = await s.done;
  assert.equal(text, "Ẹ káàárọ̀! How I fit help you today?");
  assert.equal(done.text, text);
  assert.equal(done.usage.completionTokens, 9);
  assert.equal(seen.at(-1).body.stream, true);
  assert.deepEqual(seen.at(-1).body.stream_options, { include_usage: true });
});

test("sdk: retries busy servers, then explains failures", async () => {
  failNext = 1;
  const natlas = new Natlas({ baseURL: `${base}/v1` });
  assert.match((await natlas.chat("hi")).text, /káàárọ̀/);

  await assert.rejects(new Natlas({ baseURL: `${base}/missing/v1` }).chat("hi"), (e: any) => {
    assert.ok(e instanceof NatlasError);
    assert.equal(e.code, "model_missing");
    assert.match(e.hint, /ollama create n-atlas/);
    return true;
  });

  await assert.rejects(new Natlas({ baseURL: "http://127.0.0.1:9/v1", retries: 0 }).chat("hi"), (e: any) => {
    assert.equal(e.code, "unreachable");
    assert.match(e.hint, /ollama serve/);
    return true;
  });

  await assert.rejects(new Natlas({ baseURL: `${base}/slow/v1`, timeoutMs: 300 }).chat("hi"), (e: any) => {
    assert.equal(e.code, "timeout");
    return true;
  });

  await assert.rejects(natlas.chat("hi", { language: "fr" as any }), (e: any) => e.code === "invalid");
});

test("sdk: long conversations are trimmed to fit the context window", () => {
  const turn = "word ".repeat(400); // ~500 tokens each
  const messages = [{ role: "system", content: "sys" }];
  for (let i = 0; i < 20; i++) messages.push({ role: i % 2 ? "assistant" : "user", content: `${i} ${turn}` });
  const { messages: kept, dropped } = fitContext(messages, { maxTokens: 512 });
  assert.ok(dropped > 0);
  assert.equal(kept[0].role, "system");
  assert.equal(kept.at(-1), messages.at(-1));
  const total = kept.reduce((s: number, m: any) => s + estimateTokens(m.content) + 4, 0);
  assert.ok(total <= 8092 - 512);
  assert.throws(() => fitContext([{ role: "user", content: turn.repeat(20) }]), (e: any) => e.code === "too_long");
});

test("sdk: detectLanguage recognises Nigerian languages", () => {
  assert.equal(detectLanguage("Abeg, wetin dey happen for market today? Oga no dey."), "pid");
  assert.equal(detectLanguage("Ẹ káàárọ̀, ṣé àlàáfíà ni? Mo fẹ́ ra ọjà."), "yo");
  assert.equal(detectLanguage("Ina kwana? Ina so in sayi shinkafa amma kuɗi ya ƙare."), "ha");
  assert.equal(detectLanguage("The rice price went up again this week in Lagos."), "en");
});

test("sdk: Launchpad's copy of the SDK is in sync (run `node sdk/sync.mjs`)", async () => {
  const { readFileSync } = await import("node:fs");
  // @ts-expect-error — plain JS module
  const { render } = await import("../sdk/sync.mjs");
  const copy = readFileSync(new URL("../frontend/src/export/sdkSource.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(copy, render());
});
