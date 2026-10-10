/**
 * Design chat route.
 *
 *   POST /api/design/turn  { answers, history, useCase?, language? }  → SSE
 *     {type:"snapshot", snapshot}   — instant: updated brief + blueprint preview
 *     {type:"question", english}    — the question this turn asks, in English (non-English sessions)
 *     {type:"delta", delta}*        — N-ATLAS's conversational reply, streamed
 *     {type:"warning", message}     — N-ATLAS failed; the engine's question is used instead
 *     {type:"done"}
 *
 * The brief and blueprint come from the deterministic engine, so the canvas
 * updates immediately and stays accurate; N-ATLAS only writes the reply. With
 * a `language`, N-ATLAS replies — and asks the engine's questions — in it.
 */

import { Router } from "express";
import {
  endOfSentence,
  MAX_REPLY_SENTENCES,
  SLOTS,
  replyPrompt,
  snapshot,
  translationPrompt,
  type Answers,
  type ChatMessage,
} from "../design/interview.js";
import type { LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

const REPLY_TOKENS = 180;
const TRANSLATE_TOKENS = 120;

function parseAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of [...SLOTS, "notes"] as const) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, key === "notes" ? 4000 : 2000);
  }
  return out;
}

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
}

function parseLanguage(raw: unknown): LangCode | undefined {
  return raw === "en" || raw === "pid" || raw === "yo" || raw === "ha" || raw === "ig" ? raw : undefined;
}

/** Does the reply already end with (roughly) the question we asked for? */
function asksQuestion(reply: string, question: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return norm(reply).includes(norm(question).slice(0, 40));
}

/** Translated questions, so each is only translated once (the opening question is the same for everyone). */
const translations = new Map<string, string>();
const MAX_CACHED = 500;

/** Tidy a model translation: first paragraph, no wrapping quotes or "Translation:" label. */
export function cleanTranslation(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/^(translation|answer)\s*:\s*/i, "")
    .replace(/^["“'«]+|["”'»]+$/g, "")
    .trim();
}

export function designRouter(provider: NAtlasProvider): Router {
  const router = Router();

  /** Stream the question in `language` (from the cache when we have it). Returns what was sent. */
  async function sendTranslated(
    question: string,
    language: LangCode,
    send: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    const key = `${language}::${question}`;
    const cached = translations.get(key);
    if (cached) {
      send(cached);
      return cached;
    }
    const { system, prompt } = translationPrompt(question, language);
    let raw = "";
    await provider.generateStream(
      prompt,
      { system, maxTokens: TRANSLATE_TOKENS, temperature: 0.1 },
      (chunk) => {
        if (chunk.type === "delta") raw += chunk.delta;
      },
      signal,
    );
    const text = cleanTranslation(raw);
    if (!text) throw new Error("N-ATLAS returned an empty translation");
    if (translations.size >= MAX_CACHED) translations.delete(translations.keys().next().value!);
    translations.set(key, text);
    send(text);
    return text;
  }

  router.post("/design/turn", async (req, res) => {
    const answers = parseAnswers(req.body?.answers);
    const history = parseHistory(req.body?.history);
    const useCase = typeof req.body?.useCase === "string" ? req.body.useCase : undefined;
    const language = parseLanguage(req.body?.language);
    const foreign = language && language !== "en" ? language : undefined;

    const snap = snapshot(answers, useCase);
    const sse = openSse(res);
    sse.send({ type: "snapshot", snapshot: snap });

    // Canvas edits only need the new snapshot — no model call.
    if (req.body?.reply === false) {
      sse.send({ type: "done" });
      return sse.end();
    }

    const delta = (d: string) => sse.send({ type: "delta", delta: d });
    if (foreign) sse.send({ type: "question", english: snap.question });

    // Opening turn: nothing to respond to yet, just ask.
    if (!history.some((m) => m.role === "user")) {
      try {
        if (foreign) await sendTranslated(snap.question, foreign, delta, sse.signal);
        else delta(snap.question);
      } catch (err) {
        logger.error("design question translation failed", { reason: err instanceof Error ? err.message : String(err) });
        if (!sse.signal.aborted) {
          sse.send({ type: "warning", message: "N-ATLAS couldn't translate the question just now, so here it is in English." });
          delta(snap.question);
        }
      }
      sse.send({ type: "done" });
      return sse.end();
    }

    const { system, prompt } = replyPrompt(snap, history, language);
    let reply = "";
    // Our own signal too, so we can stop N-ATLAS once the reply is long
    // enough — the 8B model ignores "one sentence", and on a CPU every extra
    // token costs about a second.
    const ctrl = new AbortController();
    sse.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      await provider.generateStream(
        prompt,
        { system, maxTokens: REPLY_TOKENS, temperature: 0.4 },
        (chunk) => {
          if (chunk.type !== "delta" || ctrl.signal.aborted) return;
          const before = reply.length;
          reply += chunk.delta;
          const end = endOfSentence(reply, MAX_REPLY_SENTENCES);
          if (end >= 0) {
            if (end > before) delta(reply.slice(before, end));
            reply = reply.slice(0, end);
            ctrl.abort();
          } else {
            delta(chunk.delta);
          }
        },
        ctrl.signal,
      );
      // The 8B model sometimes forgets to ask; the interview must keep moving.
      if (!sse.signal.aborted) {
        const sep = reply.trim() ? "\n\n" : "";
        if (foreign) {
          if (!reply.includes("?")) await sendTranslated(snap.question, foreign, (d) => delta(sep + d), sse.signal);
        } else if (!asksQuestion(reply, snap.question)) {
          delta(sep + snap.question);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("design reply failed", { reason: message });
      if (!sse.signal.aborted) {
        sse.send({ type: "warning", message: "N-ATLAS couldn't reply just now, so here's the next question." });
        delta((reply.trim() ? "\n\n" : "") + snap.question);
      }
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  return router;
}
