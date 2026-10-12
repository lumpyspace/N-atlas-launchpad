/**
 * Go live routes.
 *
 *   POST /api/deploy/ask    { project, history, language? }  → SSE
 *     The developer asks how to put their app online; the answer is written for
 *     their exact project (deploy/guide.ts). With an assistant model it thinks
 *     and N-ATLAS says it in the developer's language, commands left untouched;
 *     otherwise N-ATLAS answers on its own. Events as in the Design chat:
 *     question (the English), understood, via, delta, reset, warning, done.
 *
 *   POST /api/deploy/check  { url, message }  → LiveCheck
 *     Opens the live app like its first visitor: page, an N-ATLAS answer, the
 *     safety checks (deploy/check.ts).
 *
 * Launchpad never deploys anything itself: the developer runs the steps.
 */

import { Router } from "express";
import type { Brain } from "../brain/brain.js";
import { relay } from "../brain/relay.js";
import type { ChatMessage } from "../design/interview.js";
import { CheckError, checkLiveApp } from "../deploy/check.js";
import { guideSystem, parseGuideProject } from "../deploy/guide.js";
import { LANG_NAMES, type LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

const LANGS = ["en", "pid", "yo", "ha", "ig"];

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
}

export function deployRouter(provider: NAtlasProvider, brain: Brain | undefined, publicMode: boolean): Router {
  const router = Router();

  router.post("/deploy/ask", async (req, res) => {
    const project = parseGuideProject(req.body?.project);
    const history = parseHistory(req.body?.history);
    const language = (LANGS.includes(req.body?.language) ? req.body.language : "en") as LangCode;
    if (!project || history[history.length - 1]?.role !== "user") {
      return res.status(400).json({ error: "Send { project: { name, lang, channel }, history: [... ending with the question] }" });
    }
    const system = guideSystem(project, provider.connection?.());
    const latest = history[history.length - 1].content;
    const sse = openSse(res);
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
            maxTokens: 900,
            protectCode: true,
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
          logger.error("go-live relay failed; N-ATLAS answers alone", { reason: err instanceof Error ? err.message : String(err) });
          sse.send({ type: "reset" });
          sse.send({ type: "warning", message: "The assistant model isn't available right now, so N-ATLAS answered on its own." });
        }
      }
      // N-ATLAS on its own: the same facts, answered directly in the developer's language.
      const transcript = history.map((m) => `${m.role === "user" ? "Developer" : "Guide"}: ${m.content}`).join("\n\n");
      await provider.generateStream(
        `${transcript}\n\nGuide:`,
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
      logger.error("go-live guide failed", { reason: message });
      if (!sse.signal.aborted) sse.send({ type: "warning", message: "N-ATLAS couldn't answer just now — please try again." });
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  router.post("/deploy/check", async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url : "";
    const message = typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message.slice(0, 500) : "Hello! What can you help me with?";
    if (!url.trim()) return res.status(400).json({ error: "Paste your app's live link." });
    try {
      // On your own Launchpad, localhost apps can be checked too; a public one only checks public links.
      res.json(await checkLiveApp(url, message, { allowPrivate: !publicMode }));
    } catch (err) {
      if (err instanceof CheckError) return res.status(400).json({ error: err.message });
      logger.error("live check failed", { reason: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "The check failed unexpectedly — please try again." });
    }
  });

  return router;
}
