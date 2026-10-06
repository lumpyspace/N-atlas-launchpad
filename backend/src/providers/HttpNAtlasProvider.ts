/**
 * HttpNAtlasProvider — the REAL integration.
 *
 * It talks to an OpenAI-compatible chat-completions endpoint that serves the
 * actual N-ATLAS model. We chose the OpenAI chat shape because every realistic
 * way to serve N-ATLAS exposes it:
 *   - Ollama               -> http://localhost:11434/v1   (CPU-friendly, local)
 *   - vLLM / TGI           -> OpenAI-compatible server on a GPU box
 *   - HF Inference Endpoint-> TGI "messages" API with a bearer token
 *
 * So the SAME code reaches N-ATLAS regardless of where/how it is hosted. To
 * change hosting you change .env, not this file.
 *
 * This provider NEVER fabricates output. If the endpoint is unreachable or
 * returns an error, it throws — it does not invent a response.
 */

import { logger } from "../logger.js";
import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
} from "./NAtlasProvider.js";

interface HttpProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Human-readable language names used to hint the model via the system prompt. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "Nigerian-accented English",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
};

export class HttpNAtlasProvider implements NAtlasProvider {
  readonly name = "http";
  readonly isMock = false;

  constructor(private readonly cfg: HttpProviderConfig) {
    if (!cfg.endpoint) {
      throw new Error(
        "HttpNAtlasProvider requires NATLAS_ENDPOINT. Point it at your " +
          "self-hosted N-ATLAS server (see docs/N-ATLAS-INTEGRATION.md).",
      );
    }
  }

  /** Strip a trailing slash and the endpoint of any embedded secrets for logs. */
  private get chatUrl(): string {
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    // Allow the user to pass either ".../v1" or the full ".../v1/chat/completions".
    return base.endsWith("/chat/completions")
      ? base
      : `${base}/chat/completions`;
  }

  async generate(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const started = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    const systemBits: string[] = [];
    if (options.system) systemBits.push(options.system);
    if (options.language && LANGUAGE_NAMES[options.language]) {
      systemBits.push(`Respond in ${LANGUAGE_NAMES[options.language]}.`);
    }
    if (systemBits.length) {
      messages.push({ role: "system", content: systemBits.join(" ") });
    }
    messages.push({ role: "user", content: prompt });

    const body = {
      model: this.cfg.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 512,
      stop: options.stop,
      stream: false,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;

      const res = await fetch(this.chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // Log without secrets; the logger redacts tokens defensively.
        logger.error("N-ATLAS request failed", {
          url: this.chatUrl,
          status: res.status,
          detail: detail.slice(0, 500),
        });
        throw new Error(`N-ATLAS endpoint returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      if (!text) {
        throw new Error("N-ATLAS endpoint returned an empty completion");
      }

      return {
        text,
        model: data?.model ?? this.cfg.model,
        provider: this.name,
        isMock: false,
        latencyMs: Date.now() - started,
        usage: data?.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        raw: data,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("N-ATLAS generate() failed", { reason: message });
      throw err instanceof Error ? err : new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<HealthStatus> {
    const base: Omit<HealthStatus, "ok" | "detail"> = {
      provider: this.name,
      isMock: false,
      endpoint: this.chatUrl,
      model: this.cfg.model,
      checkedAt: new Date().toISOString(),
    };
    try {
      const r = await this.generate("ping", { maxTokens: 8, temperature: 0 });
      return {
        ...base,
        ok: true,
        detail: `Reached N-ATLAS. Sample latency ${r.latencyMs}ms.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...base, ok: false, detail: `Could not reach N-ATLAS: ${message}` };
    }
  }
}
