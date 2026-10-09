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
import { getSecuritySuite } from "../security/suites.js";
import { SEVERITY_WEIGHT } from "../security/types.js";
import { openSse } from "./sse.js";

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

  /**
   * POST /api/security/stream — streams the attack run as SSE:
   * {type:"start",total} → {type:"case",done,total,result}* → {type:"done",run}.
   * Body: { systemPrompt, only?: string[], quick?: boolean }
   */
  router.post("/security/stream", async (req, res) => {
    const systemPrompt = req.body?.systemPrompt;
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      return res.status(400).json({ error: "`systemPrompt` (non-empty string) is required." });
    }
    let only: string[] | undefined = Array.isArray(req.body?.only)
      ? req.body.only.filter((x: unknown) => typeof x === "string")
      : undefined;
    if (!only && req.body?.quick) only = quickAttackIds();

    const sse = openSse(res);
    try {
      const run = await runSecuritySuite(systemPrompt, provider, {
        only,
        signal: sse.signal,
        onStart: (total) => sse.send({ type: "start", total }),
        onProgress: (done, total, result) => sse.send({ type: "case", done, total, result }),
      });
      sse.send({ type: "done", run });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("security stream failed", { reason: message });
      sse.send({ type: "error", message });
    } finally {
      sse.end();
    }
  });

  return router;
}

/** Attacks in a quick run. */
const QUICK_ATTACKS = 6;

/** Most severe attacks first, one per category before any repeats. */
function quickAttackIds(): string[] {
  const bySeverity = [...getSecuritySuite()].sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity],
  );
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const pass of [0, 1]) {
    for (const t of bySeverity) {
      if (picked.length >= QUICK_ATTACKS) break;
      if (picked.includes(t.id) || (pass === 0 && seen.has(t.category))) continue;
      seen.add(t.category);
      picked.push(t.id);
    }
  }
  return picked;
}
