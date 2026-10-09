/**
 * HttpNAtlasProvider — the REAL integration.
 *
 * Talks to an OpenAI-compatible chat-completions endpoint that serves N-ATLAS.
 * Works with Ollama (local CPU), vLLM/TGI (GPU), or a HF Inference Endpoint.
 */

import { logger } from "../logger.js";
import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
  StreamChunk,
} from "./NAtlasProvider.js";

interface HttpProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "Nigerian-accented English",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
  pid: "Nigerian Pidgin",
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

  private get chatUrl(): string {
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    return base.endsWith("/chat/completions")
      ? base
      : `${base}/chat/completions`;
  }

  private buildMessages(
    prompt: string,
    options: GenerateOptions,
  ): Array<{ role: string; content: string }> {
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
    return messages;
  }

  async generate(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const started = Date.now();
    const messages = this.buildMessages(prompt, options);

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

  async generateStream(
    prompt: string,
    options: GenerateOptions = {},
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const started = Date.now();
    let ttftMs: number | undefined;
    const messages = this.buildMessages(prompt, options);

    const body = {
      model: this.cfg.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 512,
      stop: options.stop,
      stream: true,
      // Ask for token usage; OpenAI-compatible servers (incl. Ollama) send it
      // in a final chunk with an empty `choices` array.
      stream_options: { include_usage: true },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    // Chain the optional external abort signal into our controller
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

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
        throw new Error(
          `N-ATLAS endpoint returned HTTP ${res.status}: ${detail.slice(0, 200)}`,
        );
      }

      if (!res.body) throw new Error("No response body for streaming");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let tokensGenerated = 0;
      let deltaCount = 0; // fallback: ~1 token per streamed delta

      try {
        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;

            let parsed: any;
            try {
              parsed = JSON.parse(trimmed.slice(6));
            } catch {
              continue;
            }

            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              if (ttftMs === undefined) ttftMs = Date.now() - started;
              deltaCount++;
              onChunk({ type: "delta", delta });
            }

            // Usage arrives on whichever chunk carries it (usually the last one)
            if (parsed?.usage?.completion_tokens) {
              tokensGenerated = parsed.usage.completion_tokens;
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }

      if (!controller.signal.aborted) {
        const totalMs = Date.now() - started;
        if (tokensGenerated === 0) tokensGenerated = deltaCount;
        // Rate over the generation phase only, so prompt processing doesn't drag it down
        const genMs = Math.max(1, totalMs - (ttftMs ?? 0));
        const tokensPerSec =
          tokensGenerated > 0
            ? Math.round((tokensGenerated / (genMs / 1000)) * 10) / 10
            : 0;
        onChunk({
          type: "stats",
          ttftMs: ttftMs ?? totalMs,
          totalMs,
          tokensGenerated,
          tokensPerSec,
        });
      }
    } catch (err) {
      const aborted = controller.signal.aborted || (signal?.aborted ?? false);
      if (!aborted) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("N-ATLAS generateStream() failed", { reason: message });
        throw err instanceof Error ? err : new Error(message);
      }
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
