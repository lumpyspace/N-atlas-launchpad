/**
 * Improve route.
 *
 *   POST /api/improve -> { systemPrompt, failedCategories? } -> HardenResult
 *
 * Deterministic: given the categories that failed the security run, it returns a
 * hardened system prompt plus a human-readable list of changes. The client then
 * re-runs the security suite against the new prompt to get a REAL after-score.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { hardenSystemPrompt } from "../improve/harden.js";

export function improveRouter(): Router {
  const router = Router();

  router.post("/improve", (req, res) => {
    const systemPrompt = req.body?.systemPrompt;
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "`systemPrompt` (non-empty string) is required." });
    }
    const failedCategories = Array.isArray(req.body?.failedCategories)
      ? req.body.failedCategories.filter((x: unknown) => typeof x === "string")
      : [];

    try {
      return res.json(hardenSystemPrompt(systemPrompt, failedCategories));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("improve endpoint failed", { reason: message });
      return res.status(500).json({ error: "Improve failed.", detail: message });
    }
  });

  return router;
}
