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
  /** Extra OpenAI-compatible models offered in Compare (e.g. base Llama 3). */
  compareModels: CompareModel[];
}

export interface CompareModel {
  id: string;
  label: string;
  model: string;
  /** Empty = same endpoint as N-ATLAS. */
  endpoint: string;
  apiKey: string;
}

/**
 * COMPARE_MODELS="Llama 3.1 8B|llama3.1:8b;GPT-4o mini|gpt-4o-mini|https://api.openai.com/v1|OPENAI_API_KEY"
 * Entries are `label|model[|endpoint[|NAME_OF_ENV_VAR_WITH_KEY]]`, separated by `;`.
 * Configured server-side on purpose: visitors pick from this list rather than
 * typing URLs the server would call.
 */
function parseCompareModels(raw: string | undefined): CompareModel[] {
  if (!raw?.trim()) return [];
  return raw
    .split(";")
    .map((entry) => entry.split("|").map((x) => x.trim()))
    .filter(([label, model]) => label && model)
    .map(([label, model, endpoint = "", keyEnv = ""], i) => ({
      id: `cmp-${i + 1}`,
      label,
      model,
      endpoint,
      apiKey: keyEnv ? (process.env[keyEnv] ?? "").trim() : "",
    }));
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
    compareModels: parseCompareModels(process.env.COMPARE_MODELS),
  };
}
