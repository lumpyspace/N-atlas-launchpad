/**
 * POST /api/generate        — single-shot JSON completion (used by eval engine)
 * POST /api/generate/stream — SSE streaming completion (used by Playground)
 */

import { Router } from "express";
import { logger } from "../logger.js";
import type {
  GenerateOptions,
  NAtlasProvider,
  StreamChunk,
} from "../providers/NAtlasProvider.js";

export function generateRouter(provider: NAtlasProvider): Router {
  const router = Router();

  // ── Non-streaming (used by eval + security engines) ─────────────────────────

  router.post("/generate", async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "`prompt` (non-empty string) is required." });
    }

    const options: GenerateOptions = req.body?.options ?? {};

    try {
      const result = await provider.generate(prompt, options);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("generate endpoint failed", { reason: message });
      return res.status(502).json({
        error: "N-ATLAS request failed.",
        detail: message,
        isMock: provider.isMock,
      });
    }
  });

  // ── Streaming (used by Playground) ─────────────────────────────────────────

  router.post("/generate/stream", async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "`prompt` (non-empty string) is required." });
    }

    const options: GenerateOptions = req.body?.options ?? {};

    // Server-Sent Events headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (chunk: StreamChunk) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };

    // Abort Ollama when the CLIENT closes the connection (not when the request
    // body is consumed — req "close" fires too early through Vite's proxy).
    const controller = new AbortController();
    res.on("close", () => controller.abort());

    try {
      await provider.generateStream(prompt, options, send, controller.signal);
      if (!controller.signal.aborted && !res.writableEnded) {
        send({ type: "done" });
      }
    } catch (err) {
      if (!controller.signal.aborted && !res.writableEnded) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("stream endpoint failed", { reason: message });
        send({ type: "error", message });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}
