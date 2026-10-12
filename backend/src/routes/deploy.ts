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
import { CheckError, checkLiveApp } from "../deploy/check.js";
import { guideSystem, parseGuideProject } from "../deploy/guide.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";
import { answerChat, parseLanguage, questionHistory } from "./chatAnswer.js";

export function deployRouter(provider: NAtlasProvider, brain: Brain | undefined, publicMode: boolean): Router {
  const router = Router();

  router.post("/deploy/ask", async (req, res) => {
    const project = parseGuideProject(req.body?.project);
    const history = questionHistory(req);
    if (!project || !history) {
      return res.status(400).json({ error: "Send { project: { name, lang, channel }, history: [... ending with the question] }" });
    }
    await answerChat(openSse(res), {
      provider,
      brain,
      system: guideSystem(project, provider.connection?.()),
      history,
      language: parseLanguage(req.body?.language),
      keep: [project.name],
      label: "go-live guide",
    });
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
