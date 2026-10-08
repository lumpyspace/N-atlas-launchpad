/**
 * Security route.
 *
 *   POST /api/security  -> { systemPrompt, maxTests?, only? } -> SecurityRunResult
 *
 * Runs the attack suite against the app's own system prompt via the configured
 * provider. `only` lets the Improve step re-test just the previously-failed ids.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { runSecuritySuite } from "../security/runner.js";

export function securityRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.post("/security", async (req, res) => {
    const systemPrompt = req.body?.systemPrompt;
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "`systemPrompt` (non-empty string) is required." });
    }
    const maxTestsRaw = req.body?.maxTests;
    const maxTests =
      Number.isInteger(maxTestsRaw) && maxTestsRaw > 0 ? maxTestsRaw : undefined;
    const only = Array.isArray(req.body?.only)
      ? req.body.only.filter((x: unknown) => typeof x === "string")
      : undefined;

    try {
      const run = await runSecuritySuite(systemPrompt, provider, { maxTests, only });
      return res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("security endpoint failed", { reason: message });
      return res.status(502).json({
        error: "Security run failed.",
        detail: message,
        isMock: provider.isMock,
      });
    }
  });

  return router;
}
