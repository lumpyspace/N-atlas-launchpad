/**
 * GET /api/health
 *
 * Verifies the "application -> N-ATLAS -> response" chain and reports, loudly,
 * whether the live provider is real or the MOCK. The UI uses `isMock` to show a
 * prominent warning banner whenever mock output could be displayed.
 */

import { Router } from "express";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";

export function healthRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const status = await provider.health();
    // 200 when we reached the provider; 503 when the real endpoint is down.
    res.status(status.ok ? 200 : 503).json(status);
  });

  return router;
}
