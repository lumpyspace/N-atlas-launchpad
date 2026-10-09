/**
 * Blueprint route.
 *
 *   POST /api/blueprint  -> { description, useCase? } -> Blueprint
 *   GET  /api/use-cases  -> kinds of app the build guide knows
 *
 * Deterministic (template-driven), so it needs no provider and returns fast.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { generateBlueprint } from "../blueprint/generate.js";
import { listUseCases } from "../blueprint/useCases.js";

export function blueprintRouter(): Router {
  const router = Router();

  router.post("/blueprint", (req, res) => {
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
      return res.json(generateBlueprint(description, { useCase, tasks, targetUsers }));
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
