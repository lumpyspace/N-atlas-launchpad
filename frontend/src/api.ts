/**
 * Thin client for the N-ATLAS Forge backend REST API.
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

export async function generate(
  prompt: string,
  options?: { language?: string; temperature?: number; maxTokens?: number },
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
