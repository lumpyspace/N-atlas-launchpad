/**
 * One answer in a helper chat (the Go live guide, the page helper): the
 * assistant model thinks in English and N-ATLAS says it in the developer's
 * language, commands and names left untouched; without the assistant model,
 * N-ATLAS answers on its own. Events as in the Design chat: question (the
 * English), understood, via, delta, reset, warning, done.
 */

import type { Request } from "express";
import type { Brain } from "../brain/brain.js";
import { relay } from "../brain/relay.js";
import type { ChatMessage } from "../design/interview.js";
import { LANG_NAMES, type LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import type { SseStream } from "./sse.js";

const LANGS = ["en", "yo", "ha", "ig"];

export function parseLanguage(raw: unknown): LangCode {
  return (LANGS.includes(raw as string) ? raw : "en") as LangCode;
}

export function parseHistory(raw: unknown, max = 12): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-max)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
}

/** The request's history, if it ends with the developer's question. */
export function questionHistory(req: Request): ChatMessage[] | null {
  const history = parseHistory(req.body?.history);
  return history[history.length - 1]?.role === "user" ? history : null;
}

export async function answerChat(
  sse: SseStream,
  opts: {
    provider: NAtlasProvider;
    brain?: Brain;
    system: string;
    history: ChatMessage[];
    language: LangCode;
    /** Names to keep as they are in translation (e.g. the app's name). */
    keep?: string[];
    /** Who's who in N-ATLAS's transcript when it answers alone. */
    roles?: { user: string; assistant: string };
    maxTokens?: number;
    label: string;
  },
): Promise<void> {
  const { provider, brain, system, history, language } = opts;
  const latest = history[history.length - 1].content;
  try {
    if (brain?.available()) {
      let thinker: string | undefined;
      try {
        await relay({
          brain,
          natlas: provider,
          language,
          messages: [{ role: "system", content: system }, ...history],
          words: language === "en" ? "" : latest,
          maxTokens: opts.maxTokens ?? 900,
          protectCode: true,
          keep: opts.keep,
          signal: sse.signal,
          onEvent: (e) => {
            if (e.type === "thought") {
              thinker = e.brain;
              sse.send({ type: "question", english: e.english });
            } else if (e.type === "voice") sse.send({ type: "via", brain: thinker, voice: e.voice });
            else sse.send(e);
          },
        });
        return;
      } catch (err) {
        if (sse.signal.aborted) return;
        logger.error(`${opts.label}: relay failed; N-ATLAS answers alone`, { reason: err instanceof Error ? err.message : String(err) });
        sse.send({ type: "reset" });
        sse.send({ type: "warning", message: "The assistant model isn't available right now, so N-ATLAS answered on its own." });
      }
    }
    // N-ATLAS on its own: the same facts, answered directly in the developer's language.
    const roles = opts.roles ?? { user: "Developer", assistant: "Guide" };
    const transcript = history.map((m) => `${m.role === "user" ? roles.user : roles.assistant}: ${m.content}`).join("\n\n");
    await provider.generateStream(
      `${transcript}\n\n${roles.assistant}:`,
      {
        system: `${system}\n\nReply in ${LANG_NAMES[language]}. Keep commands and file names exactly as written above.`,
        maxTokens: 600,
        temperature: 0.2,
      },
      (chunk) => {
        if (chunk.type === "delta" && chunk.delta) sse.send({ type: "delta", delta: chunk.delta });
      },
      sse.signal,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`${opts.label} failed`, { reason: message });
    if (!sse.signal.aborted) sse.send({ type: "warning", message: "N-ATLAS couldn't answer just now — please try again." });
  } finally {
    sse.send({ type: "done" });
    sse.end();
  }
}
