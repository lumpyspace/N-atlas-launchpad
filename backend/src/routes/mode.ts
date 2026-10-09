/**
 * Mode-switching / endpoint-reconfiguration route.
 *
 *   POST /api/mode  -> { mode: "http", endpoint, model?, apiKey? }
 *                   -> HealthStatus (after the swap)
 *
 * Hot-swaps the running provider without a server restart.
 * Returns the new health check so the frontend can update its badge.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { HttpNAtlasProvider } from "../providers/HttpNAtlasProvider.js";
import type { ProviderRef } from "../providers/ProviderRef.js";

export function modeRouter(ref: ProviderRef): Router {
  const router = Router();

  router.post("/mode", async (req, res) => {
    const { mode, endpoint, model, apiKey } = req.body ?? {};

    if (mode !== "http") {
      return res.status(400).json({ error: 'mode must be "http"' });
    }

    const ep = (typeof endpoint === "string" ? endpoint : "").trim();
    if (!ep) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    ref.swap(
      new HttpNAtlasProvider({
        endpoint: ep,
        apiKey: typeof apiKey === "string" ? apiKey.trim() : "",
        model: (typeof model === "string" && model.trim()) ? model.trim() : "n-atlas",
        timeoutMs: 300_000,
      }),
    );
    logger.info("Provider reconfigured → http", { endpoint: ep });

    try {
      const health = await ref.health();
      if (!health.ok) {
        return res.status(502).json({
          error: "Could not reach the N-ATLAS endpoint. Check that Ollama is running.",
          detail: health.detail,
        });
      }
      return res.json(health);
    } catch (err: any) {
      return res.status(502).json({
        error: "Could not reach the N-ATLAS endpoint. Check that Ollama is running.",
        detail: err?.message ?? "unknown error",
      });
    }
  });

  return router;
}
