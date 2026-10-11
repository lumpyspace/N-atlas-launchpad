/**
 * The "brain": a larger model that does the thinking for Launchpad's own
 * helper jobs (the Design chat first), while N-ATLAS stays the voice — it
 * reads the developer's language and says the answer back in it (see
 * relay.ts). Optional: with no keys, Launchpad runs on N-ATLAS alone.
 *
 * Providers are tried in order (Gemini, then Groq, then any other
 * OpenAI-compatible endpoint); one that's out of quota is skipped for a while.
 * A daily request budget protects the account behind a public link.
 * Keys stay on the server: they're read from the environment and never sent
 * to the browser.
 */

import { logger } from "../logger.js";

export interface BrainProvider {
  /** Shown to people: "Gemini", "Groq"… */
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  /** Extra request fields (e.g. Gemini's reasoning_effort). */
  extra?: Record<string, unknown>;
  /** Tokens added to max_tokens for a model that "thinks" before it answers. */
  thinkingTokens?: number;
}

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainReply {
  text: string;
  provider: string;
  model: string;
}

export interface BrainStatus {
  configured: boolean;
  providers: { name: string; model: string; coolingDownUntil?: string }[];
  usedToday: number;
  dailyLimit: number;
}

/** Read the providers from the environment, in the order they're tried. */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): BrainProvider[] {
  const out: BrainProvider[] = [];
  // GEMINI_MODEL may list several, tried in order: each has its own free quota,
  // and a busy one is often fine a model over.
  const geminiModels = (env.GEMINI_MODEL?.trim() || "gemini-3.8-flash,gemini-3.5-flash").split(",").map((m) => m.trim()).filter(Boolean);
  for (const model of env.GEMINI_API_KEY?.trim() ? geminiModels : []) {
    out.push({
      name: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      model,
      apiKey: env.GEMINI_API_KEY!.trim(),
      // Gemini thinks before answering, and the thinking counts against max_tokens.
      extra: { reasoning_effort: "low" },
      thinkingTokens: 1024,
    });
  }
  if (env.GROQ_API_KEY?.trim()) {
    out.push({
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      model: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      apiKey: env.GROQ_API_KEY.trim(),
      extra: { reasoning_effort: "low" },
      thinkingTokens: 1024,
    });
  }
  if (env.BRAIN_BASE_URL?.trim() && env.BRAIN_MODEL?.trim()) {
    out.push({
      name: env.BRAIN_NAME?.trim() || "Assistant model",
      baseURL: env.BRAIN_BASE_URL.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, ""),
      model: env.BRAIN_MODEL.trim(),
      apiKey: env.BRAIN_API_KEY?.trim() ?? "",
    });
  }
  return out;
}

/** The text up to its last complete sentence ("" if there's none). */
export function completeSentences(text: string): string {
  const m = text.match(/^[\s\S]*[.!?…](?=["”')\]]*(\s|$))["”')\]]*/);
  return m ? m[0].trim() : "";
}

const key = (p: BrainProvider) => `${p.name}/${p.model}`;

export class BrainError extends Error {
  constructor(
    message: string,
    /** Worth trying the next provider (quota, overload, network). */
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrainError";
  }
}

export interface BrainOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export class Brain {
  private cooldown = new Map<string, number>();
  private day = "";
  private used = 0;

  constructor(
    private readonly providers: BrainProvider[],
    private readonly dailyLimit = 500,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now,
    private readonly retryDelayMs = 2000,
  ) {}

  get configured(): boolean {
    return this.providers.length > 0;
  }

  /** Is a request allowed right now (configured, under today's budget, a provider not cooling down)? */
  available(): boolean {
    this.rollDay();
    return this.configured && this.used < this.dailyLimit && this.providers.some((p) => !this.isCooling(p));
  }

  status(): BrainStatus {
    this.rollDay();
    return {
      configured: this.configured,
      providers: this.providers.map((p) => ({
        name: p.name,
        model: p.model,
        ...(this.isCooling(p) ? { coolingDownUntil: new Date(this.cooldown.get(key(p))!).toISOString() } : {}),
      })),
      usedToday: this.used,
      dailyLimit: this.dailyLimit,
    };
  }

  /** Ask the first provider that answers. Throws BrainError when none can. */
  async chat(messages: BrainMessage[], options: BrainOptions = {}): Promise<BrainReply> {
    this.rollDay();
    if (!this.configured) throw new BrainError("No assistant model is configured", false);
    if (this.used >= this.dailyLimit) throw new BrainError("Today's assistant-model budget is used up", false);
    let last: BrainError | null = null;
    for (const p of this.providers) {
      if (this.isCooling(p)) continue;
      try {
        this.used++;
        let text: string;
        try {
          text = await this.call(p, messages, options);
        } catch (err) {
          // Busy (503): one more try after a short pause before moving on.
          if (!(err instanceof BrainError && err.status === 503) || options.signal?.aborted) throw err;
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
          this.used++;
          text = await this.call(p, messages, options);
        }
        return { text, provider: p.name, model: p.model };
      } catch (err) {
        if (options.signal?.aborted) throw err;
        last = err instanceof BrainError ? err : new BrainError(String(err), true);
        logger.error("assistant model failed", { provider: p.name, reason: last.message });
        // Out of quota: rest this provider for a minute. Either way, try the next one.
        if (last.status === 429) this.cooldown.set(key(p), this.now() + 60_000);
      }
    }
    throw last ?? new BrainError("Every assistant model is resting after hitting its limit", true);
  }

  private async call(p: BrainProvider, messages: BrainMessage[], o: BrainOptions): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    o.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
    let res: Response;
    try {
      res = await this.fetchImpl(`${p.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({
          model: p.model,
          messages,
          max_tokens: (o.maxTokens ?? 600) + (p.thinkingTokens ?? 0),
          temperature: o.temperature ?? 0.4,
          ...p.extra,
        }),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new BrainError(`${p.name} is unreachable: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      throw new BrainError(`${p.name} returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`, retryable, res.status);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    let text = data.choices?.[0]?.message?.content?.trim() ?? "";
    // Cut off by the token limit: keep the complete sentences only.
    if (data.choices?.[0]?.finish_reason === "length") text = completeSentences(text);
    if (!text) throw new BrainError(`${p.name} returned an empty reply`, true);
    return text;
  }

  private isCooling(p: BrainProvider): boolean {
    return (this.cooldown.get(key(p)) ?? 0) > this.now();
  }

  private rollDay() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }
}
