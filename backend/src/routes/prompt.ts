/**
 * Prompt studio route.
 *
 *   POST /api/prompt/doctor  { systemPrompt, data?, languages?, needsKnowledge?, maxTokens? }
 *                            → { findings, budget, words }
 *
 * Deterministic and instant, so the UI can call it as the developer types.
 */

import { Router } from "express";
import { diagnose } from "../prompt/doctor.js";

export function promptRouter(): Router {
  const router = Router();

  router.post("/prompt/doctor", (req, res) => {
    const b = req.body ?? {};
    if (typeof b.systemPrompt !== "string") {
      return res.status(400).json({ error: "`systemPrompt` (string) is required." });
    }
    res.json(
      diagnose({
        systemPrompt: b.systemPrompt.slice(0, 60_000),
        data: typeof b.data === "string" ? b.data.slice(0, 60_000) : undefined,
        languages: Array.isArray(b.languages) ? b.languages.filter((l: unknown) => typeof l === "string").slice(0, 10) : undefined,
        needsKnowledge: b.needsKnowledge === true,
        maxTokens: Number.isFinite(b.maxTokens) ? b.maxTokens : undefined,
      }),
    );
  });

  return router;
}
