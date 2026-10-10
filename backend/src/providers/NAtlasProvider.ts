/**
 * NAtlasProvider — the abstraction that isolates the rest of N-ATLAS Forge
 * from *how* we actually reach the N-ATLAS model.
 */

/** Options that map onto standard chat-completion parameters. */
export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  language?: "en" | "yo" | "ha" | "ig" | "pid" | (string & {});
  stop?: string[];
  /** Cancels the in-flight request (e.g. the user pressed Stop). */
  signal?: AbortSignal;
}

/** Normalised result returned by every provider. */
export interface GenerateResult {
  text: string;
  model: string;
  provider: string;
  isMock: boolean;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

/** One event from a streaming generation. */
export interface StreamChunk {
  type: "delta" | "stats" | "error" | "done";
  /** type="delta": the new token(s) */
  delta?: string;
  /** type="stats": timing/throughput numbers */
  ttftMs?: number;
  totalMs?: number;
  tokensGenerated?: number;
  tokensPerSec?: number;
  /** type="error": human-readable message */
  message?: string;
}

/** Health report for the "app -> N-ATLAS -> response" chain. */
export interface HealthStatus {
  ok: boolean;
  provider: string;
  isMock: boolean;
  endpoint: string | null;
  model: string;
  detail: string;
  checkedAt: string;
}

export interface NAtlasProvider {
  readonly name: string;
  readonly isMock: boolean;
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  /**
   * Streaming variant. Calls onChunk for each delta, then once with type="stats"
   * when done. Throws on fatal errors; does not throw on graceful abort.
   */
  generateStream(
    prompt: string,
    options: GenerateOptions,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  health(): Promise<HealthStatus>;
  /** Where the provider sends requests (for the setup doctor). Absent for providers with no server. */
  connection?(): Connection | undefined;
}

export interface Connection {
  /** Base URL of the OpenAI-compatible API, e.g. http://localhost:11434/v1 */
  endpoint: string;
  model: string;
  apiKey: string;
}
