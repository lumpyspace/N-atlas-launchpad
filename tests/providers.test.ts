/**
 * HttpNAtlasProvider streaming contract, tested against a local fake
 * OpenAI-compatible server (no real model needed).
 *
 * Covers the Ollama behaviour the Playground relies on: deltas stream through,
 * and token usage arrives in a final chunk with an empty `choices` array.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { HttpNAtlasProvider } from "../backend/src/providers/HttpNAtlasProvider.js";
import type { StreamChunk } from "../backend/src/providers/NAtlasProvider.js";

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Fake server that streams the given chunks, recording each request body. */
async function fakeServer(chunks: string[]): Promise<{ url: string; server: Server; bodies: any[] }> {
  const bodies: any[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const c of chunks) res.write(c);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/v1`, server, bodies };
}

function provider(endpoint: string) {
  return new HttpNAtlasProvider({ endpoint, apiKey: "", model: "n-atlas", timeoutMs: 5000 });
}

test("streams deltas and reads usage from the final empty-choices chunk", async () => {
  const { url, server, bodies } = await fakeServer([
    sse({ choices: [{ index: 0, delta: { content: "Ẹ " } }] }),
    sse({ choices: [{ index: 0, delta: { content: "káàbọ̀" }, finish_reason: "stop" }] }),
    sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } }),
  ]);
  try {
    const events: StreamChunk[] = [];
    await provider(url).generateStream("hello", {}, (c) => events.push(c));

    const text = events.filter((e) => e.type === "delta").map((e: any) => e.delta).join("");
    assert.equal(text, "Ẹ káàbọ̀");

    const stats = events.find((e) => e.type === "stats") as any;
    assert.ok(stats, "a stats event must be emitted");
    assert.equal(stats.tokensGenerated, 7, "usage must be read from the trailing chunk");

    assert.equal(bodies[0].stream, true);
    assert.deepEqual(bodies[0].stream_options, { include_usage: true });
  } finally {
    server.close();
  }
});

test("falls back to counting deltas when the server sends no usage", async () => {
  const { url, server } = await fakeServer([
    sse({ choices: [{ delta: { content: "a" } }] }),
    sse({ choices: [{ delta: { content: "b" } }] }),
    sse({ choices: [{ delta: { content: "c" }, finish_reason: "length" }] }),
  ]);
  try {
    const events: StreamChunk[] = [];
    await provider(url).generateStream("hi", {}, (c) => events.push(c));
    const stats = events.find((e) => e.type === "stats") as any;
    assert.equal(stats.tokensGenerated, 3);
    assert.ok(stats.tokensPerSec > 0);
  } finally {
    server.close();
  }
});

test("provider is never flagged as mock", () => {
  const p = provider("http://127.0.0.1:1/v1");
  assert.equal(p.isMock, false);
  assert.equal(p.name, "http");
});
