/** A hosted (public) Launchpad: visitors can't switch the N-ATLAS server, and model calls are rate-limited. */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp, isPublic, rateLimit } from "../backend/src/app.ts";

const config = { port: 0, provider: "http", natlasEndpoint: "http://127.0.0.1:9/v1", natlasApiKey: "secret-key", natlasModel: "m", requestTimeoutMs: 1000, compareModels: [] } as any;

async function call(env: Record<string, string>, path: string, body: unknown, headers: Record<string, string> = {}) {
  const { app } = createApp(config, env as any);
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test("public mode: on Vercel by default, or LAUNCHPAD_PUBLIC=1; off with LAUNCHPAD_PUBLIC=0", () => {
  assert.equal(isPublic({} as any), false);
  assert.equal(isPublic({ VERCEL: "1" } as any), true);
  assert.equal(isPublic({ VERCEL: "1", LAUNCHPAD_PUBLIC: "0" } as any), false);
  assert.equal(isPublic({ LAUNCHPAD_PUBLIC: "1" } as any), true);
});

test("public mode: visitors can't point the server at another address", async () => {
  const r = await call({ LAUNCHPAD_PUBLIC: "1" }, "/api/mode", { mode: "http", endpoint: "http://169.254.169.254/" });
  assert.equal(r.status, 403);
});

test("rate limit: per visitor, a burst limit then 429; other visitors unaffected", async () => {
  const limit = rateLimit(2, 100, () => 1_000);
  const run = (ip: string) =>
    new Promise<number>((resolve) => {
      const res: any = { status: (s: number) => ({ json: () => resolve(s) }) };
      limit({ method: "POST", headers: { "x-real-ip": ip }, socket: {} } as any, res, () => resolve(200));
    });
  assert.deepEqual([await run("a"), await run("a"), await run("a"), await run("b")], [200, 200, 429, 200]);
});

test("public mode: a 429 explains the limit", async () => {
  const env = { LAUNCHPAD_PUBLIC: "1", PUBLIC_PER_MINUTE: "1" };
  const { app } = createApp(config, env as any);
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const post = () => fetch(`http://127.0.0.1:${port}/api/blueprint`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"description":"A price app for farmers in Kano"}' });
    assert.equal((await post()).status, 200);
    const second = await post();
    assert.equal(second.status, 429);
    assert.match((await second.json()).error, /public demo limits/);
  } finally {
    server.close();
  }
});

test("secrets pasted into a dashboard: quotes and a NAME= prefix are forgiven", async () => {
  const { cleanSecret } = await import("../backend/src/config.ts");
  assert.equal(cleanSecret(' "abc123" ', "NATLAS_API_KEY"), "abc123");
  assert.equal(cleanSecret("NATLAS_API_KEY=abc123", "NATLAS_API_KEY"), "abc123");
  assert.equal(cleanSecret("NATLAS_API_KEY='abc123'", "NATLAS_API_KEY"), "abc123");
  assert.equal(cleanSecret(undefined, "X"), "");
});
