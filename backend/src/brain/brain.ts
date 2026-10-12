/**
 * The "brain": a larger model that does the thinking for Launchpad's own
 * helper jobs (the Design chat first), while N-ATLAS stays the voice — it
 * reads the developer's language and says the answer back in it (see
 * relay.ts). Optional: with no keys, Launchpad runs on N-ATLAS alone.
 *
 * Providers are tried in BRAIN_ORDER (default: Groq — fastest — then Gemini,
 * then any other OpenAI-compatible endpoint); one that's out of quota is
 * skipped for a while, and a slow one gives way after 45 seconds.
 * A daily request budget protects the account behind a public link.
 * Keys stay on the server: they're read from the environment and never sent
 * to the browser.
 */

import { cleanSecret } from "../config.js";
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
  /** False for a model that is fine in English but poor in Yoruba, Hausa and Igbo. */
  nigerian?: boolean;
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
      apiKey: cleanSecret(env.GEMINI_API_KEY, "GEMINI_API_KEY"),
      // Gemini thinks before answering, and the thinking counts against max_tokens.
      extra: { reasoning_effort: "low" },
      thinkingTokens: 1024,
    });
  }
  // GROQ_MODEL may list several too: on Groq's free plan each model has its own
  // per-minute token limit, so a second and third model triple the room.
  const groqModels = (env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b").split(",").map((m) => m.trim()).filter(Boolean);
  for (const model of env.GROQ_API_KEY?.trim() ? groqModels : []) {
    const gptOss = model.startsWith("openai/gpt-oss");
    out.push({
      name: "Groq",
      baseURL: "https://api.groq.com/openai/v1",
      model,
      apiKey: cleanSecret(env.GROQ_API_KEY, "GROQ_API_KEY"),
      // gpt-oss thinks a little (the thinking counts against max_tokens); Qwen answers straight away.
      ...(gptOss ? { extra: { reasoning_effort: "low" }, thinkingTokens: 1024 } : model.startsWith("qwen/") ? { extra: { reasoning_effort: "none" } } : {}),
      // The smaller models write poor Yoruba, Hausa and Igbo: they help with English work only.
      ...(model === "openai/gpt-oss-120b" ? {} : { nigerian: false }),
    });
  }
  if (env.BRAIN_BASE_URL?.trim() && env.BRAIN_MODEL?.trim()) {
    out.push({
      name: env.BRAIN_NAME?.trim() || "Assistant model",
      baseURL: env.BRAIN_BASE_URL.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, ""),
      model: env.BRAIN_MODEL.trim(),
      apiKey: cleanSecret(env.BRAIN_API_KEY, "BRAIN_API_KEY"),
    });
  }
  // BRAIN_ORDER, e.g. "gemini,groq": names first in the list are tried first.
  const order = (env.BRAIN_ORDER?.trim() || "groq,gemini").toLowerCase().split(",").map((s) => s.trim());
  const rank = (p: BrainProvider) => {
    const i = order.indexOf(p.name.toLowerCase());
    return i < 0 ? order.length : i;
  };
  return out.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p);
}

/** How long a rate-limited provider asks us to wait ("Please try again in 13.7s"), capped at a minute. */
export function retryAfterMs(message: string): number {
  const m = message.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (!m) return 60_000;
  const ms = (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000;
  return Math.min(60_000, Math.ceil(ms) + 500);
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
  /** The request reads or writes Yoruba, Hausa or Igbo: only models good at them may answer. */
  nigerian?: boolean;
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
    const able = this.providers.filter((p) => !options.nigerian || p.nigerian !== false);
    // A strong model resting a few seconds (a per-minute limit) is worth the wait.
    if (options.nigerian && able.length && able.every((p) => this.isCooling(p))) {
      const wait = Math.min(...able.map((p) => this.cooldown.get(key(p))! - this.now()));
      if (wait <= 10_000) await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    }
    for (const p of able) {
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
        // Out of quota: rest this provider as long as it asks ("try again in 4.2s"), at most
        // a minute — a per-minute limit frees up in seconds. Either way, try the next one.
        if (last.status === 429) this.cooldown.set(key(p), this.now() + retryAfterMs(last.message));
      }
    }
    throw last ?? new BrainError("Every assistant model is resting after hitting its limit", true);
  }

  private async call(p: BrainProvider, messages: BrainMessage[], o: BrainOptions): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
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
