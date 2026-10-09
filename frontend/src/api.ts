/**
 * Thin client for the N-ATLAS Launchpad backend REST API.
 *
 * In dev, Vite proxies /api to http://localhost:8787 (see vite.config.ts).
 * In production you can override the base URL with VITE_API_BASE_URL.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface HealthStatus {
  ok: boolean;
  provider: string;
  isMock: boolean;
  endpoint: string | null;
  model: string;
  detail: string;
  checkedAt: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: string;
  isMock: boolean;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}

/** Reconfigure the backend to point at a different Ollama/vLLM endpoint. */
export async function switchMode(opts: {
  endpoint: string;
  model?: string;
  apiKey?: string;
}): Promise<HealthStatus> {
  const res = await fetch(`${BASE}/api/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "http", ...opts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface GenerateOptions {
  system?: string;
  language?: string;
  temperature?: number;
  maxTokens?: number;
}

export type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "stats"; ttftMs: number; totalMs: number; tokensGenerated: number; tokensPerSec: number }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Streaming generate — yields deltas as they arrive, then a stats event, then done.
 * Throws on HTTP errors; does not throw on graceful abort (AbortError).
 */
export async function* streamGenerate(
  prompt: string,
  options?: GenerateOptions,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, options }),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    throw e;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        throw e;
      }
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
          yield event;
          if (event.type === "done" || event.type === "error") return;
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

export async function generate(
  prompt: string,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Evaluation engine -----------------------------------------------------

export interface SuiteInfo {
  name: string;
  description: string;
  cases: number;
}

export interface CheckResult {
  label: string;
  type: string;
  passed: boolean;
  detail: string;
  weight: number;
}

export interface CaseResult {
  caseId: string;
  category: string;
  language?: string;
  prompt: string;
  output: string;
  isMock: boolean;
  passed: boolean;
  score: number;
  checks: CheckResult[];
  latencyMs: number;
  error?: string;
}

export interface SuiteRunResult {
  suite: string;
  provider: string;
  model: string;
  isMock: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    passRate: number;
    byCategory: Record<string, { total: number; passed: number }>;
  };
  cases: CaseResult[];
}

export async function getSuites(): Promise<{ suites: SuiteInfo[]; default: string }> {
  const res = await fetch(`${BASE}/api/suites`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function runEvaluation(
  suite: string,
  maxCases?: number,
): Promise<SuiteRunResult> {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suite, maxCases }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** Run the sector evaluation suite against an app's own system prompt. */
export async function runAppEvaluation(
  sector: string,
  systemPrompt: string,
  description?: string,
  maxCases?: number,
): Promise<SuiteRunResult> {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sector, systemPrompt, description, maxCases }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Blueprint (Describe → Build) ------------------------------------------

export type Sector =
  | "education"
  | "finance"
  | "agriculture"
  | "legal"
  | "customer-support"
  | "general";

export interface Blueprint {
  name: string;
  sector: Sector;
  purpose: string;
  targetUsers: string;
  primaryTasks: string[];
  languages: string[];
  nigerianContext: string[];
  risks: string[];
  systemPrompt: string;
  suggestedEvalCategories: string[];
  suggestedSecurityTests: string[];
}

export async function getBlueprint(description: string): Promise<Blueprint> {
  const res = await fetch(`${BASE}/api/blueprint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Security engine (Attack Your Application) -----------------------------

export type Severity = "low" | "medium" | "high" | "critical";

export interface SecurityResult {
  id: string;
  category: string;
  severity: Severity;
  prompt: string;
  expectedBehavior: string;
  passed: boolean;
  response: string;
  explanation: string;
  mitigation: string;
  isMock: boolean;
  latencyMs: number;
  error?: string;
}

export interface SecurityRunResult {
  provider: string;
  model: string;
  isMock: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    score: number;
    byCategory: Record<string, { total: number; passed: number }>;
    bySeverity: Record<string, { total: number; passed: number }>;
  };
  results: SecurityResult[];
}

/** Run the attack suite against an app's system prompt. `only` re-tests ids. */
export async function runSecurity(
  systemPrompt: string,
  only?: string[],
): Promise<SecurityRunResult> {
  const res = await fetch(`${BASE}/api/security`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemPrompt, only }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Improve ----------------------------------------------------------------

export interface Improvement {
  newPrompt: string;
  changes: string[];
  /** The appended SECURITY DIRECTIVES block alone (for showing the diff). */
  addedBlock: string;
}

export async function getImprovement(
  systemPrompt: string,
  failedCategories: string[],
): Promise<Improvement> {
  const res = await fetch(`${BASE}/api/improve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemPrompt, failedCategories }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
