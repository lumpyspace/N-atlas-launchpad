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
  if (env.GEMINI_API_KEY?.trim()) {
    out.push({
      name: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      apiKey: env.GEMINI_API_KEY.trim(),
    });
  }
  if (env.GROQ_API_KEY?.trim()) {
    out.push({
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      model: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      apiKey: env.GROQ_API_KEY.trim(),
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
        ...(this.isCooling(p) ? { coolingDownUntil: new Date(this.cooldown.get(p.name)!).toISOString() } : {}),
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
        const text = await this.call(p, messages, options);
        return { text, provider: p.name, model: p.model };
      } catch (err) {
        if (options.signal?.aborted) throw err;
        last = err instanceof BrainError ? err : new BrainError(String(err), true);
        logger.error("assistant model failed", { provider: p.name, reason: last.message });
        // Out of quota: rest this provider for a minute. Either way, try the next one.
        if (last.status === 429) this.cooldown.set(p.name, this.now() + 60_000);
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
        body: JSON.stringify({ model: p.model, messages, max_tokens: o.maxTokens ?? 600, temperature: o.temperature ?? 0.4 }),
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
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new BrainError(`${p.name} returned an empty reply`, true);
    return text;
  }

  private isCooling(p: BrainProvider): boolean {
    return (this.cooldown.get(p.name) ?? 0) > this.now();
  }

  private rollDay() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }
}
