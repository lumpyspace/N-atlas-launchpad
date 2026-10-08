/**
 * Mode-switching route.
 *
 *   POST /api/mode  -> { mode: "demo" | "http", endpoint?, model?, apiKey? }
 *                   -> HealthStatus (after the swap)
 *
 * Hot-swaps the running provider so the whole app switches without a restart.
 * Returns the new health check so the frontend can update its badge immediately.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import { HttpNAtlasProvider } from "../providers/HttpNAtlasProvider.js";
import { ScriptedDemoProvider } from "../providers/ScriptedDemoProvider.js";
import type { ProviderRef } from "../providers/ProviderRef.js";

export function modeRouter(ref: ProviderRef): Router {
  const router = Router();

  router.post("/mode", async (req, res) => {
    const { mode, endpoint, model, apiKey } = req.body ?? {};

    if (mode === "demo") {
      ref.swap(new ScriptedDemoProvider());
      logger.info("Provider hot-swapped → demo");
      const health = await ref.health();
      return res.json(health);
    }

    if (mode === "http") {
      const ep = (typeof endpoint === "string" ? endpoint : "").trim();
      if (!ep) {
        return res.status(400).json({ error: "endpoint is required for http mode" });
      }
      ref.swap(
        new HttpNAtlasProvider({
          endpoint: ep,
          apiKey: typeof apiKey === "string" ? apiKey.trim() : "",
          model: (typeof model === "string" && model.trim()) ? model.trim() : "n-atlas",
          timeoutMs: 300_000,
        }),
      );
      logger.info("Provider hot-swapped → http", { endpoint: ep });

      try {
        const health = await ref.health();
        if (!health.ok) {
          ref.swap(new ScriptedDemoProvider());
          logger.warn("Live provider unreachable — rolled back to demo");
          return res.status(502).json({
            error: "Could not reach the N-ATLAS endpoint. Rolled back to demo mode.",
            detail: health.detail,
          });
        }
        return res.json(health);
      } catch (err: any) {
        ref.swap(new ScriptedDemoProvider());
        logger.warn("Live provider threw during health check — rolled back to demo", { err: err?.message });
        return res.status(502).json({
          error: "Could not reach the N-ATLAS endpoint. Rolled back to demo mode.",
          detail: err?.message ?? "unknown error",
        });
      }
    }

    return res.status(400).json({ error: 'mode must be "demo" or "http"' });
  });

  return router;
}
