import "dotenv/config";

export type ProviderKind = "http";

export interface AppConfig {
  port: number;
  provider: ProviderKind;
  /** Base URL of the OpenAI-compatible N-ATLAS endpoint. */
  natlasEndpoint: string;
  /** Optional bearer token for the endpoint. */
  natlasApiKey: string;
  /** Model name the serving layer expects (e.g. "n-atlas" for Ollama). */
  natlasModel: string;
  /** Request timeout in ms for calls to N-ATLAS. */
  requestTimeoutMs: number;
}

function parseProvider(value: string | undefined): ProviderKind {
  const v = (value ?? "http").toLowerCase().trim();
  if (v === "http") return v;
  throw new Error(`NATLAS_PROVIDER must be "http", got "${value}"`);
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    provider: parseProvider(process.env.NATLAS_PROVIDER),
    natlasEndpoint: (process.env.NATLAS_ENDPOINT ?? "").trim(),
    natlasApiKey: (process.env.NATLAS_API_KEY ?? "").trim(),
    natlasModel: (process.env.NATLAS_MODEL ?? "n-atlas").trim(),
    requestTimeoutMs: Number(process.env.NATLAS_REQUEST_TIMEOUT_MS ?? 120_000),
  };
}
