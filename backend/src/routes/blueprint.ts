/**
 * Blueprint route.
 *
 *   POST /api/blueprint  -> { description } -> Blueprint
 *
 * Deterministic (template-driven), so it needs no provider and returns fast.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { generateBlueprint } from "../blueprint/generate.js";

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
    try {
      return res.json(generateBlueprint(description));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("blueprint endpoint failed", { reason: message });
      return res
        .status(500)
        .json({ error: "Blueprint generation failed.", detail: message });
    }
  });

  return router;
}
