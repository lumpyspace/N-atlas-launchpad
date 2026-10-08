/**
 * Centralised, typed configuration loaded from environment variables.
 *
 * IMPORTANT: These variable names describe how WE will reach a self-hosted
 * N-ATLAS inference server. N-ATLAS has no official public API, so there is no
 * "official" set of variables to copy — this is our own, clearly-documented
 * configuration contract (see docs/N-ATLAS-INTEGRATION.md).
 */

import "dotenv/config";

export type ProviderKind = "http" | "mock" | "demo";

export interface AppConfig {
  port: number;
  /** Which provider to use. Defaults to "mock" so the app runs out of the box. */
  provider: ProviderKind;
  /** Base URL of the OpenAI-compatible N-ATLAS endpoint (http provider only). */
  natlasEndpoint: string;
  /** Optional bearer token for the endpoint (e.g. a HF Inference Endpoint). */
  natlasApiKey: string;
  /** Model name the serving layer expects (e.g. "n-atlas" for Ollama). */
  natlasModel: string;
  /** Request timeout in ms for calls to N-ATLAS. */
  requestTimeoutMs: number;
}

function parseProvider(value: string | undefined): ProviderKind {
  const v = (value ?? "mock").toLowerCase().trim();
  if (v === "http" || v === "mock" || v === "demo") return v;
  throw new Error(
    `NATLAS_PROVIDER must be "http", "demo" or "mock", got "${value}"`,
  );
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    provider: parseProvider(process.env.NATLAS_PROVIDER),
    natlasEndpoint: (process.env.NATLAS_ENDPOINT ?? "").trim(),
    natlasApiKey: (process.env.NATLAS_API_KEY ?? "").trim(),
    // Default to the official HF repo id; override per serving layer as needed.
    natlasModel: (process.env.NATLAS_MODEL ?? "NCAIR1/N-ATLaS").trim(),
    requestTimeoutMs: Number(process.env.NATLAS_REQUEST_TIMEOUT_MS ?? 120_000),
  };
}
