/**
 * POST /api/generate
 *
 * The playground endpoint. Takes a prompt, returns an N-ATLAS completion.
 * The response always includes `isMock` so the client can never confuse mock
 * placeholder text with a real N-ATLAS answer.
 *
 * Body: { prompt: string, options?: GenerateOptions }
 */

import { Router } from "express";
import { logger } from "../logger.js";
import type {
  GenerateOptions,
  NAtlasProvider,
} from "../providers/NAtlasProvider.js";

export function generateRouter(provider: NAtlasProvider): Router {
  const router = Router();

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
      // The logger redacts secrets; we never echo internal details to the client.
      logger.error("generate endpoint failed", { reason: message });
      return res.status(502).json({
        error: "N-ATLAS request failed.",
        detail: message,
        isMock: provider.isMock,
      });
    }
  });

  return router;
}
