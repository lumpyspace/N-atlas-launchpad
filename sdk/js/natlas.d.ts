export declare const VERSION: string;

export declare const NATLAS: {
  readonly model: "NCAIR1/N-ATLaS";
  readonly contextTokens: number;
  readonly temperature: number;
  readonly repetitionPenalty: number;
};

export declare const LANGUAGES: {
  readonly en: "Nigerian-accented English";
  readonly yo: "Yoruba";
  readonly ha: "Hausa";
  readonly ig: "Igbo";
  readonly pid: "Nigerian Pidgin";
};
export type LanguageCode = keyof typeof LANGUAGES;

export declare const FACTS_HEADER: string;

export type NatlasErrorCode =
  | "unreachable"
  | "model_missing"
  | "auth"
  | "http"
  | "timeout"
  | "aborted"
  | "empty"
  | "too_long"
  | "invalid";

export declare class NatlasError extends Error {
  readonly code: NatlasErrorCode;
  readonly status?: number;
  /** What to do about it. */
  readonly hint?: string;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Source {
  source: string;
  /** Passage number within the document, 1-based. */
  index: number;
  text: string;
  score: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatOptions {
  /** Your app's instructions. */
  system?: string;
  /** Adds "Respond in …" to the system prompt. */
  language?: LanguageCode;
  /** Answer from these documents: the best passages are added to the prompt. */
  knowledge?: Knowledge;
  /** How many passages to add (default 3). */
  k?: number;
  /** Default 0.1 (N-ATLAS model card). */
  temperature?: number;
  /** Longest reply, in tokens (default 512). */
  maxTokens?: number;
  /** Default 1.12 (N-ATLAS model card); null to leave it to the server. */
  repetitionPenalty?: number | null;
  stop?: string[];
  signal?: AbortSignal;
  /** Whole-call timeout (default 600 000 ms — CPU inference is slow). */
  timeoutMs?: number;
  /** Retries on connection errors, 429 and 5xx (default 2). */
  retries?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  latencyMs: number;
  usage?: Usage;
  /** The passages the answer was given, if you passed `knowledge`. */
  sources: Source[];
  /** Oldest turns dropped to fit the 8,092-token context. */
  dropped: number;
  finishReason?: string;
}

export interface NatlasOptions {
  /** Default: NATLAS_BASE_URL, else http://localhost:11434/v1 (Ollama). */
  baseURL?: string;
  /** Default: NATLAS_MODEL, else "n-atlas". */
  model?: string;
  /** Default: NATLAS_API_KEY. */
  apiKey?: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
}

export declare class Natlas {
  constructor(options?: NatlasOptions);
  readonly baseURL: string;
  readonly model: string;
  chat(input: string | Message[], options?: ChatOptions): Promise<ChatResult>;
  generate(prompt: string, options?: ChatOptions): Promise<string>;
  stream(input: string | Message[], options?: ChatOptions): AsyncGenerator<string> & { done: Promise<ChatResult> };
  ping(): Promise<{ ok: true; latencyMs: number }>;
}
export default Natlas;

export declare class Knowledge {
  constructor(passages?: Array<{ source: string; index: number; text: string }>);
  /** Launchpad's knowledge/passages.json, or a project's documents. */
  static fromJSON(data: string | unknown[]): Knowledge;
  static format(hits: Source[]): string;
  /** Add a document; returns how many passages it was split into. */
  add(source: string, text: string): number;
  search(query: string, k?: number): Source[];
  readonly size: number;
}

export declare function chat(input: string | Message[], options?: ChatOptions): Promise<ChatResult>;
export declare function generate(
  prompt: string,
  options?: { system?: string; temperature?: number; maxTokens?: number; language?: LanguageCode },
): Promise<string>;
export declare function estimateTokens(text: string): number;
export declare function fitContext(
  messages: Message[],
  options?: { maxTokens?: number; contextTokens?: number },
): { messages: Message[]; dropped: number };
export declare function tokenize(text: string): string[];
export declare function chunkText(text: string, options?: { targetWords?: number; maxWords?: number }): string[];
export declare function detectLanguage(text: string): "en" | "yo" | "ha" | "ig" | "pid";
