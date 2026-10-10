/**
 * Setup doctor: checks a developer's N-ATLAS setup step by step and says how
 * to fix what's wrong.
 *
 * Each check reports an id, a status and a `variant` naming which explanation
 * applies, plus the measured `data` and any fix `command`. The page holds the
 * explanations (so they can be translated); commands are code and stay as-is.
 * Ollama-specific checks (model build, context window, settings, hardware)
 * are skipped for other OpenAI-compatible servers.
 *
 * The doctor never changes anything — it only suggests commands.
 */

import os from "node:os";
import { NATLAS_FACTS } from "../blueprint/buildPlan.js";
import type { Connection } from "../providers/NAtlasProvider.js";

export const CHECKS = ["endpoint", "model", "build", "context", "settings", "reply", "speed", "hardware"] as const;
export type CheckId = (typeof CHECKS)[number];
export type CheckStatus = "pass" | "warn" | "fail" | "info" | "skip";

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  /** Which explanation applies, e.g. "ok", "lowBit", "cold", "cpu". */
  variant: string;
  data: Record<string, string | number>;
  /** Commands or file contents that fix it. */
  command?: string;
}

export interface DoctorDeps {
  fetch: typeof fetch;
  totalMem: () => number;
  freeMem: () => number;
  now: () => number;
}

const realDeps: DoctorDeps = { fetch: globalThis.fetch.bind(globalThis), totalMem: os.totalmem, freeMem: os.freemem, now: Date.now };

const CONTEXT = NATLAS_FACTS.contextTokens; // 8,092
const RECOMMENDED = NATLAS_FACTS.recommended; // temperature 0.1, repetition penalty 1.12
const GB = 1024 ** 3;

/** A Modelfile that rebuilds the installed model with the recommended settings. */
export function modelfileFix(model: string): string {
  const base = model.replace(/:latest$/, "");
  return [
    "# Modelfile — same model, N-ATLAS's full context and recommended settings",
    `FROM ${base}`,
    "PARAMETER num_ctx 8192",
    `PARAMETER temperature ${RECOMMENDED.temperature}`,
    `PARAMETER repeat_penalty ${RECOMMENDED.repetitionPenalty}`,
    "",
    `# then, in the same folder:`,
    `ollama create ${base}-8k -f Modelfile`,
    `# and use the model name "${base}-8k" in Launchpad (Connect to N-ATLAS) or NATLAS_MODEL`,
  ].join("\n");
}

/** Ollama's "num_ctx 4096\ntemperature 0.2" parameter block → a map. */
export function parseParameters(block: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (block ?? "").split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(.+)$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(url);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export async function runDoctor(
  conn: Connection,
  onResult: (r: CheckResult) => void,
  signal?: AbortSignal,
  deps: DoctorDeps = realDeps,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const report = (r: CheckResult) => {
    results.push(r);
    onResult(r);
  };
  const skipRest = (from: CheckId, variant: string) => {
    for (const id of CHECKS.slice(CHECKS.indexOf(from))) {
      if (!results.some((r) => r.id === id)) report({ id, status: "skip", variant, data: {} });
    }
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (conn.apiKey) headers.authorization = `Bearer ${conn.apiKey}`;
  const get = async (url: string, init: RequestInit = {}, ms = 15_000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      return await deps.fetch(url, { ...init, headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  const base = conn.endpoint.replace(/\/+$/, "");
  const ollamaRoot = base.replace(/\/v1$/, "");

  // 1. Is the server there?
  let ids: string[] = [];
  const t0 = deps.now();
  try {
    const res = await get(`${base}/models`);
    if (res.status === 401 || res.status === 403) {
      report({ id: "endpoint", status: "fail", variant: "auth", data: { endpoint: base, status: res.status } });
      skipRest("model", "noServer");
      return results;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { id: string }[] };
    ids = (body.data ?? []).map((m) => m.id);
    report({ id: "endpoint", status: "pass", variant: "ok", data: { endpoint: base, ms: deps.now() - t0 } });
  } catch (err) {
    report({
      id: "endpoint",
      status: "fail",
      variant: "down",
      data: { endpoint: base, error: err instanceof Error ? err.message : String(err) },
      command: isLocal(base) ? "ollama serve" : undefined,
    });
    skipRest("model", "noServer");
    return results;
  }

  // 2. Is the model installed?
  const wanted = conn.model;
  const found = ids.find((id) => id === wanted || id === `${wanted}:latest` || id.replace(/:latest$/, "") === wanted);
  if (!found && ids.length) {
    report({
      id: "model",
      status: "fail",
      variant: "missing",
      data: { model: wanted, available: ids.join(", ") },
      command: `ollama list\n# or create it from the N-ATLAS GGUF (see the Build guide, step 2):\nollama create ${wanted} -f Modelfile`,
    });
    skipRest("build", "noModel");
    return results;
  }
  report({ id: "model", status: "pass", variant: ids.length ? "ok" : "unlisted", data: { model: found ?? wanted } });

  // 3–5. Ollama only: how the model was built and configured.
  let isOllama = false;
  let loadedBefore = false;
  try {
    const v = await get(`${ollamaRoot}/api/version`, {}, 5_000);
    isOllama = v.ok && typeof ((await v.json()) as { version?: string }).version === "string";
  } catch {
    isOllama = false;
  }
  if (!isOllama) {
    for (const id of ["build", "context", "settings"] as const) report({ id, status: "skip", variant: "notOllama", data: {} });
  } else {
    let show: { parameters?: string; details?: { parameter_size?: string; quantization_level?: string }; model_info?: Record<string, unknown> } = {};
    try {
      const r = await get(`${ollamaRoot}/api/show`, { method: "POST", body: JSON.stringify({ model: found ?? wanted }) });
      if (r.ok) show = await r.json();
    } catch {
      /* reported below as unknown */
    }
    const quant = show.details?.quantization_level ?? "unknown";
    const size = show.details?.parameter_size ?? "?";
    const lowBit = /^(Q2|Q3|IQ1|IQ2|IQ3)/i.test(quant);
    report({ id: "build", status: lowBit ? "warn" : "pass", variant: lowBit ? "lowBit" : "ok", data: { size, quant } });

    const params = parseParameters(show.parameters);
    const numCtx = Number(params.num_ctx) || 0;
    const fix = modelfileFix(found ?? wanted);
    if (!numCtx) {
      report({ id: "context", status: "warn", variant: "default", data: { context: CONTEXT.toLocaleString("en-US") }, command: fix });
    } else if (numCtx < CONTEXT) {
      report({
        id: "context",
        status: "warn",
        variant: "small",
        data: { numCtx: numCtx.toLocaleString("en-US"), context: CONTEXT.toLocaleString("en-US") },
        command: fix,
      });
    } else {
      report({ id: "context", status: "pass", variant: "ok", data: { numCtx: numCtx.toLocaleString("en-US") } });
    }

    const temperature = params.temperature ?? "default";
    const repeat = params.repeat_penalty ?? "default";
    const matches = Number(temperature) === RECOMMENDED.temperature && Number(repeat) === RECOMMENDED.repetitionPenalty;
    report({
      id: "settings",
      status: matches ? "pass" : "info",
      variant: matches ? "ok" : "differs",
      data: { temperature, repeat, recTemperature: RECOMMENDED.temperature, recRepeat: RECOMMENDED.repetitionPenalty },
      command: matches ? undefined : fix,
    });

    try {
      const ps = await get(`${ollamaRoot}/api/ps`, {}, 5_000);
      const models = ((await ps.json()) as { models?: { name: string }[] }).models ?? [];
      loadedBefore = models.some((m) => m.name.replace(/:latest$/, "") === (found ?? wanted).replace(/:latest$/, ""));
    } catch {
      loadedBefore = false;
    }
  }

  // 6–7. A real reply: does it answer, and how fast?
  const started = deps.now();
  let first = 0;
  let text = "";
  let tokens = 0;
  try {
    const res = await get(
      `${base}/chat/completions`,
      {
        method: "POST",
        body: JSON.stringify({
          model: found ?? wanted,
          messages: [{ role: "user", content: "In one short sentence, welcome a Nigerian developer to N-ATLAS." }],
          max_tokens: 48,
          temperature: RECOMMENDED.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
      600_000,
    );
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let deltas = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          const d = chunk.choices?.[0]?.delta?.content;
          if (d) {
            if (!first) first = deps.now();
            text += d;
            deltas++;
          }
          if (chunk.usage?.completion_tokens) tokens = chunk.usage.completion_tokens;
        } catch {
          /* partial line */
        }
      }
    }
    tokens ||= deltas;
    if (!text.trim()) throw new Error("empty reply");
  } catch (err) {
    report({ id: "reply", status: "fail", variant: "error", data: { error: err instanceof Error ? err.message : String(err) } });
    report({ id: "speed", status: "skip", variant: "noReply", data: {} });
    report({ id: "hardware", status: "skip", variant: "noReply", data: {} });
    return results;
  }
  const end = deps.now();
  const cold = isOllama && !loadedBefore;
  report({
    id: "reply",
    status: "pass",
    variant: cold ? "cold" : "ok",
    data: { text: text.trim().slice(0, 200), totalS: round((end - started) / 1000), ttftS: round((first - started) / 1000) },
  });
  const genSecs = Math.max(0.001, (end - first) / 1000);
  const tps = round(Math.max(0, tokens - 1) / genSecs);
  const est = Math.round(200 / Math.max(0.1, tps));
  report({
    id: "speed",
    status: tps >= 15 ? "pass" : "warn",
    variant: tps >= 15 ? "fast" : tps >= 4 ? "ok" : "slow",
    data: { tps, est },
  });

  // 8. Hardware (Ollama): GPU or CPU, and memory when the server is this machine.
  if (!isOllama) {
    report({ id: "hardware", status: "skip", variant: "notOllama", data: {} });
    return results;
  }
  try {
    const ps = await get(`${ollamaRoot}/api/ps`, {}, 5_000);
    const models = ((await ps.json()) as { models?: { name: string; size: number; size_vram: number }[] }).models ?? [];
    const m = models.find((x) => x.name.replace(/:latest$/, "") === (found ?? wanted).replace(/:latest$/, ""));
    if (!m) throw new Error("model not loaded");
    const gpuPct = m.size ? Math.round((m.size_vram / m.size) * 100) : 0;
    const modelGb = round(m.size / GB);
    const local = isLocal(base);
    const totalGb = round(deps.totalMem() / GB);
    const freeGb = round(deps.freeMem() / GB);
    if (gpuPct >= 90) report({ id: "hardware", status: "pass", variant: "gpu", data: { gpuPct, modelGb } });
    else if (gpuPct > 0) report({ id: "hardware", status: "warn", variant: "partialGpu", data: { gpuPct, modelGb } });
    else if (local && totalGb < modelGb * 1.5)
      report({ id: "hardware", status: "warn", variant: "lowRam", data: { totalGb, modelGb } });
    // Enough memory in total, but almost none left free: other apps are pushing the model to disk.
    else if (local && freeGb < 1)
      report({ id: "hardware", status: "warn", variant: "lowFree", data: { totalGb, freeGb, modelGb } });
    else report({ id: "hardware", status: "info", variant: local ? "cpu" : "cpuRemote", data: { totalGb, freeGb, modelGb } });
  } catch {
    report({ id: "hardware", status: "skip", variant: "unknown", data: {} });
  }
  return results;
}
