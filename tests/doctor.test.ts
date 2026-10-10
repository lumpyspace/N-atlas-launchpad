import assert from "node:assert/strict";
import { test } from "node:test";
import { modelfileFix, parseParameters, runDoctor, type CheckResult, type DoctorDeps } from "../backend/src/doctor/doctor.ts";

const GB = 1024 ** 3;
const conn = { endpoint: "http://localhost:11434/v1", model: "n-atlas", apiKey: "" };

/** A fake Ollama: routes → JSON, plus a streamed chat completion. */
function fakeOllama(over: Partial<Record<string, unknown>> = {}): DoctorDeps["fetch"] {
  const routes: Record<string, unknown> = {
    "/v1/models": { data: [{ id: "n-atlas:latest" }, { id: "llama3:latest" }] },
    "/api/version": { version: "0.40.2" },
    "/api/show": { parameters: 'num_ctx                        4096\nstop                           "<|eot_id|>"\ntemperature                    0.2', details: { parameter_size: "8.0B", quantization_level: "Q4_K_M" } },
    "/api/ps": { models: [{ name: "n-atlas:latest", size: 5.2 * GB, size_vram: 0 }] },
    ...over,
  };
  return (async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/v1/chat/completions") {
      if (routes.chat === "fail") return new Response("boom", { status: 500 });
      const frames = ["Welcome", " to", " N-ATLAS", "."].map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`);
      frames.push(`data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 12 } })}\n\n`, "data: [DONE]\n\n");
      return new Response(frames.join(""), { status: 200 });
    }
    const body = routes[path];
    if (body === undefined) return new Response("not found", { status: 404 });
    if (body === "unauthorized") return new Response("no", { status: 401 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as DoctorDeps["fetch"];
}

function deps(fetch: DoctorDeps["fetch"], mem = { total: 16 * GB, free: 8 * GB }): DoctorDeps {
  let t = 0;
  return { fetch, totalMem: () => mem.total, freeMem: () => mem.free, now: () => (t += 500) };
}

const byId = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.id, r]));

test("doctor: a typical laptop setup — 4k context, default settings, CPU", async () => {
  const r = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama())));
  assert.equal(r.endpoint.status, "pass");
  assert.equal(r.model.data.model, "n-atlas:latest");
  assert.deepEqual([r.build.status, r.build.data.quant], ["pass", "Q4_K_M"]);
  assert.deepEqual([r.context.status, r.context.variant, r.context.data.numCtx], ["warn", "small", "4,096"]);
  assert.match(r.context.command ?? "", /PARAMETER num_ctx 8192/);
  assert.deepEqual([r.settings.variant, r.settings.data.temperature, r.settings.data.repeat], ["differs", "0.2", "default"]);
  assert.equal(r.reply.status, "pass");
  assert.match(String(r.reply.data.text), /Welcome to N-ATLAS/);
  assert.equal(r.reply.variant, "ok", "the model was already loaded");
  assert.deepEqual([r.hardware.variant, r.hardware.data.modelGb], ["cpu", 5.2]);
});

test("doctor: a first reply that had to load the model is marked as a cold start", async () => {
  // Not loaded before the reply, loaded after it.
  let calls = 0;
  const base = fakeOllama();
  const fetch = (async (url: string, init?: RequestInit) => {
    if (new URL(url).pathname === "/api/ps" && calls++ === 0) return new Response(JSON.stringify({ models: [] }), { status: 200 });
    return base(url, init);
  }) as DoctorDeps["fetch"];
  const r = byId(await runDoctor(conn, () => {}, undefined, deps(fetch)));
  assert.equal(r.reply.variant, "cold");
  assert.equal(r.hardware.variant, "cpu");
});

test("doctor: problems are reported with fixes, and later checks are skipped", async () => {
  const down = byId(await runDoctor(conn, () => {}, undefined, deps((async () => { throw new Error("ECONNREFUSED"); }) as any)));
  assert.equal(down.endpoint.status, "fail");
  assert.equal(down.endpoint.command, "ollama serve");
  assert.ok(["model", "build", "reply", "hardware"].every((id) => down[id].status === "skip"));

  const missing = byId(await runDoctor({ ...conn, model: "natlas" }, () => {}, undefined, deps(fakeOllama())));
  assert.equal(missing.model.status, "fail");
  assert.match(String(missing.model.data.available), /n-atlas:latest/);
  assert.equal(missing.reply.status, "skip");

  const auth = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama({ "/v1/models": "unauthorized" }))));
  assert.equal(auth.endpoint.variant, "auth");

  const noReply = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama({ chat: "fail" }))));
  assert.equal(noReply.reply.status, "fail");
  assert.equal(noReply.speed.status, "skip");
});

test("doctor: hardware — GPU, partial GPU, low memory", async () => {
  const gpu = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama({ "/api/ps": { models: [{ name: "n-atlas:latest", size: 5 * GB, size_vram: 5 * GB }] } }))));
  assert.equal(gpu.hardware.variant, "gpu");
  const partial = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama({ "/api/ps": { models: [{ name: "n-atlas:latest", size: 5 * GB, size_vram: 2 * GB }] } }))));
  assert.deepEqual([partial.hardware.variant, partial.hardware.data.gpuPct], ["partialGpu", 40]);
  const squeezed = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama(), { total: 16 * GB, free: 0.2 * GB })));
  assert.equal(squeezed.hardware.variant, "lowFree");
  const small = byId(await runDoctor(conn, () => {}, undefined, deps(fakeOllama(), { total: 6 * GB, free: 3 * GB })));
  assert.equal(small.hardware.variant, "lowRam");
});

test("doctor: non-Ollama servers skip the Ollama-only checks", async () => {
  const vllm = byId(await runDoctor({ ...conn, endpoint: "https://gpu.example.com/v1" }, () => {}, undefined, deps(fakeOllama({ "/api/version": undefined }))));
  assert.equal(vllm.endpoint.status, "pass");
  assert.ok(["build", "context", "settings", "hardware"].every((id) => vllm[id].variant === "notOllama"));
  assert.equal(vllm.reply.status, "pass");
});

test("doctor: helpers", () => {
  assert.deepEqual(parseParameters('num_ctx 8192\nstop "<|eot_id|>"\ntemperature 0.1'), { num_ctx: "8192", stop: "<|eot_id|>", temperature: "0.1" });
  const fix = modelfileFix("n-atlas:latest");
  assert.match(fix, /^FROM n-atlas$/m);
  assert.match(fix, /ollama create n-atlas-8k -f Modelfile/);
});
