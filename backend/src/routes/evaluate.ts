/**
 * Evaluation routes.
 *
 *   GET  /api/suites    -> list available test suites (name, description, size)
 *   POST /api/evaluate  -> run a suite against N-ATLAS and return scored results
 *
 * Body for POST: { suite?: string, maxCases?: number }
 *   - suite defaults to the seed "nigerian-context" suite.
 *   - maxCases caps how many cases run (useful because CPU inference is slow).
 *
 * The response is the full SuiteRunResult, including the HARD `isMock` flag so
 * the UI can loudly mark any run produced by the mock provider as NOT real.
 */

import { Router } from "express";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { runSuite } from "../eval/runner.js";
import { DEFAULT_SUITE, getSuite, listSuites } from "../eval/suites.js";

export function evaluateRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.get("/suites", (_req, res) => {
    res.json({ suites: listSuites(), default: DEFAULT_SUITE });
  });

  router.post("/evaluate", async (req, res) => {
    const suite = typeof req.body?.suite === "string" ? req.body.suite : DEFAULT_SUITE;
    const maxCasesRaw = req.body?.maxCases;
    const maxCases =
      Number.isInteger(maxCasesRaw) && maxCasesRaw > 0 ? maxCasesRaw : undefined;

    if (!getSuite(suite)) {
      return res.status(404).json({
        error: `Unknown suite "${suite}".`,
        available: listSuites().map((s) => s.name),
      });
    }

    try {
      const run = await runSuite(suite, provider, { maxCases });
      return res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("evaluate endpoint failed", { reason: message });
      return res.status(502).json({
        error: "Evaluation run failed.",
        detail: message,
        isMock: provider.isMock,
      });
    }
  });

  return router;
}
