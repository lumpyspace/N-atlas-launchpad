/**
 * Blueprint route.
 *
 *   POST /api/blueprint  -> { description, useCase? } -> Blueprint
 *   GET  /api/use-cases  -> kinds of app the build guide knows
 *
 * The plan is deterministic (template-driven). With an assistant model, it
 * also writes the app's system prompt for this exact app (blueprint/promptWriter.ts);
 * otherwise — or if that fails — the template's prompt is used.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { generateBlueprint } from "../blueprint/generate.js";
import { listUseCases } from "../blueprint/useCases.js";
import { writeSystemPrompt } from "../blueprint/promptWriter.js";
import type { Brain } from "../brain/brain.js";

export function blueprintRouter(brain?: Brain): Router {
  const router = Router();

  router.post("/blueprint", async (req, res) => {
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";
    if (!description.trim()) {
      return res
        .status(400)
        .json({ error: "A non-empty 'description' is required." });
    }
    const useCase = typeof req.body?.useCase === "string" ? req.body.useCase : undefined;
    const tasks = Array.isArray(req.body?.tasks)
      ? req.body.tasks.filter((t: unknown): t is string => typeof t === "string").map((t: string) => t.slice(0, 200))
      : undefined;
    const targetUsers = typeof req.body?.targetUsers === "string" ? req.body.targetUsers.slice(0, 300) : undefined;
    try {
      const bp = generateBlueprint(description, { useCase, tasks, targetUsers });
      // { promptBy: false } asks for the template's prompt only (e.g. refreshing an old export's server).
      if (brain?.available() && req.body?.promptBy !== false) {
        const written = await writeSystemPrompt(bp, brain);
        if (written) return res.json({ ...bp, systemPrompt: written.prompt, promptBy: written.by });
      }
      return res.json(bp);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("blueprint endpoint failed", { reason: message });
      return res
        .status(500)
        .json({ error: "Blueprint generation failed.", detail: message });
    }
  });

  /** GET /api/use-cases -> the kinds of app the build guide knows, for the picker. */
  router.get("/use-cases", (_req, res) => {
    res.json({ useCases: listUseCases() });
  });

  return router;
}
