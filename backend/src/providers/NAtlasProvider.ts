/**
 * NAtlasProvider — the abstraction that isolates the rest of N-ATLAS Forge
 * from *how* we actually reach the N-ATLAS model.
 *
 * WHY THIS EXISTS
 * ---------------
 * N-ATLAS (NCAIR1/N-ATLaS on Hugging Face) does NOT ship an official public
 * REST API. It is a gated Llama-3 8B fine-tune that you run yourself and serve
 * over HTTP (e.g. Ollama, vLLM, TGI, or a Hugging Face Inference Endpoint).
 *
 * The serving method WILL change during the project (local CPU today, a GPU
 * endpoint later). The evaluation engine must not care. So everything talks to
 * N-ATLAS *only* through this interface. Swap the implementation, keep the rest.
 *
 * There are exactly two implementations in this repo:
 *   - HttpNAtlasProvider  -> talks to a real, self-hosted N-ATLAS endpoint.
 *   - MockNAtlasProvider  -> returns clearly-labelled fake text for UI dev only.
 *
 * The `isMock` flag is deliberately part of EVERY result so the frontend can
 * never accidentally present mock text as a genuine N-ATLAS response.
 */

/** Options that map onto standard chat-completion parameters. */
export interface GenerateOptions {
  /** Optional system prompt (role/instructions for the model). */
  system?: string;
  /** Max new tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
  /**
   * Target language hint. N-ATLAS V1 supports Nigerian-accented English plus
   * Yoruba, Hausa and Igbo. This is only a hint we can weave into the prompt;
   * it is not a guaranteed model parameter.
   */
  language?: "en" | "yo" | "ha" | "ig" | (string & {});
  /** Stop sequences. */
  stop?: string[];
}

/** Normalised result returned by every provider. */
export interface GenerateResult {
  /** The generated text. For the mock provider this is clearly labelled. */
  text: string;
  /** The model identifier the provider used (e.g. "NCAIR1/N-ATLaS", "n-atlas"). */
  model: string;
  /** Which provider produced this ("http" | "mock"). */
  provider: string;
  /**
   * HARD, non-negotiable flag. `true` means this did NOT come from real N-ATLAS.
   * The API and UI must surface this so mock output is never mistaken for real.
   */
  isMock: boolean;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
  /** Token usage if the underlying server reported it. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Raw server payload, kept for debugging. Never shown to end users directly. */
  raw?: unknown;
}

/** Health report for the "app -> N-ATLAS -> response" chain. */
export interface HealthStatus {
  /** `true` only if we reached the configured provider successfully. */
  ok: boolean;
  provider: string;
  isMock: boolean;
  /** The endpoint we tried (secrets stripped), or null for the mock provider. */
  endpoint: string | null;
  model: string;
  /** Human-readable detail: success note or the sanitised failure reason. */
  detail: string;
  checkedAt: string;
}

/**
 * The single contract the whole application depends on.
 * Keep it deliberately small — one way in, one way to check health.
 */
export interface NAtlasProvider {
  /** Stable name for logs/health ("http" or "mock"). */
  readonly name: string;
  /** Whether this provider produces real N-ATLAS output. */
  readonly isMock: boolean;
  /** Generate a completion for `prompt`. */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  /** Verify the app can actually reach N-ATLAS and get a response. */
  health(): Promise<HealthStatus>;
}
