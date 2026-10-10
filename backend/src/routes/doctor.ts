/**
 * Setup doctor route.
 *
 *   POST /api/doctor  → SSE
 *     {type:"check", result}*   — one per check, as each finishes
 *     {type:"error", message}   — no server to check (e.g. mock provider)
 *     {type:"done"}
 */

import { Router } from "express";
import { runDoctor } from "../doctor/doctor.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

export function doctorRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.post("/doctor", async (_req, res) => {
    const sse = openSse(res);
    try {
      const conn = provider.connection?.();
      if (!conn) {
        sse.send({ type: "error", message: "No N-ATLAS server is configured. Use Connect to N-ATLAS first." });
        return;
      }
      await runDoctor(conn, (result) => sse.send({ type: "check", result }), sse.signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("doctor failed", { reason: message });
      if (!sse.signal.aborted) sse.send({ type: "error", message });
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  return router;
}
