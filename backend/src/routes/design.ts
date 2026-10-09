/**
 * Design chat route.
 *
 *   POST /api/design/turn  { answers, history, useCase? }  → SSE
 *     {type:"snapshot", snapshot}   — instant: updated brief + blueprint preview
 *     {type:"delta", delta}*        — N-ATLAS's conversational reply, streamed
 *     {type:"warning", message}     — N-ATLAS failed; the engine's question is used instead
 *     {type:"done"}
 *
 * The brief and blueprint come from the deterministic engine, so the canvas
 * updates immediately and stays accurate; N-ATLAS only writes the reply.
 */

import { Router } from "express";
import { SLOTS, replyPrompt, snapshot, type Answers, type ChatMessage } from "../design/interview.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

const REPLY_TOKENS = 180;

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

/** Does the reply already end with (roughly) the question we asked for? */
function asksQuestion(reply: string, question: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return norm(reply).includes(norm(question).slice(0, 40));
}

export function designRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.post("/design/turn", async (req, res) => {
    const answers = parseAnswers(req.body?.answers);
    const history = parseHistory(req.body?.history);
    const useCase = typeof req.body?.useCase === "string" ? req.body.useCase : undefined;

    const snap = snapshot(answers, useCase);
    const sse = openSse(res);
    sse.send({ type: "snapshot", snapshot: snap });

    // Opening turn: nothing to respond to yet, just ask.
    if (!history.some((m) => m.role === "user")) {
      sse.send({ type: "delta", delta: snap.question });
      sse.send({ type: "done" });
      return sse.end();
    }

    const { system, prompt } = replyPrompt(snap, history);
    let reply = "";
    try {
      await provider.generateStream(
        prompt,
        { system, maxTokens: REPLY_TOKENS, temperature: 0.4 },
        (chunk) => {
          if (chunk.type === "delta") {
            reply += chunk.delta;
            sse.send({ type: "delta", delta: chunk.delta });
          }
        },
        sse.signal,
      );
      // The 8B model sometimes forgets to ask; the interview must keep moving.
      if (!sse.signal.aborted && !asksQuestion(reply, snap.question)) {
        sse.send({ type: "delta", delta: (reply.trim() ? "\n\n" : "") + snap.question });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("design reply failed", { reason: message });
      sse.send({ type: "warning", message: "N-ATLAS couldn't reply just now, so here's the next question." });
      sse.send({ type: "delta", delta: (reply.trim() ? "\n\n" : "") + snap.question });
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  return router;
}
