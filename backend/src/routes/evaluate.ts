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
import { buildAppSuite, DEFAULT_SUITE, getSuite, listSuites } from "../eval/suites.js";
import type { Sector } from "../blueprint/types.js";

const SECTORS: Sector[] = [
  "education",
  "finance",
  "agriculture",
  "legal",
  "customer-support",
  "general",
];

export function evaluateRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.get("/suites", (_req, res) => {
    res.json({ suites: listSuites(), default: DEFAULT_SUITE });
  });

  router.post("/evaluate", async (req, res) => {
    const maxCasesRaw = req.body?.maxCases;
    const maxCases =
      Number.isInteger(maxCasesRaw) && maxCasesRaw > 0 ? maxCasesRaw : undefined;

    // Application mode: run a sector suite against the app's own system prompt.
    const sector = req.body?.sector;
    const systemPrompt =
      typeof req.body?.systemPrompt === "string" ? req.body.systemPrompt : undefined;

    try {
      if (typeof sector === "string") {
        if (!SECTORS.includes(sector as Sector)) {
          return res
            .status(400)
            .json({ error: `Unknown sector "${sector}".`, available: SECTORS });
        }
        const suite = buildAppSuite(sector as Sector);
        const run = await runSuite(suite, provider, { maxCases, systemOverride: systemPrompt });
        return res.json(run);
      }

      // Registry mode (backwards compatible): run a named suite.
      const suite = typeof req.body?.suite === "string" ? req.body.suite : DEFAULT_SUITE;
      if (!getSuite(suite)) {
        return res.status(404).json({
          error: `Unknown suite "${suite}".`,
          available: listSuites().map((s) => s.name),
        });
      }
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
