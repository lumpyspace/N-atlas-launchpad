/**
 * The page helper.
 *
 *   POST /api/help/ask  { history, language?, context: { page, mode, project? } }  → SSE
 *     The assistant model answers (N-ATLAS says it in the person's language);
 *     without it, N-ATLAS answers alone. Events as in chatAnswer.ts.
 */

import { Router } from "express";
import type { Brain } from "../brain/brain.js";
import { helperSystem, parseHelpContext } from "../help/helper.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { answerChat, parseLanguage, questionHistory } from "./chatAnswer.js";
import { openSse } from "./sse.js";

export function helpRouter(provider: NAtlasProvider, brain?: Brain): Router {
  const router = Router();

  router.post("/help/ask", async (req, res) => {
    const history = questionHistory(req);
    if (!history) return res.status(400).json({ error: "Send { history: [... ending with the question] }" });
    const context = parseHelpContext(req.body?.context);
    await answerChat(openSse(res), {
      provider,
      brain,
      system: helperSystem(context),
      history,
      language: parseLanguage(req.body?.language),
      keep: context.project ? [context.project.name] : [],
      roles: { user: "Person", assistant: "Helper" },
      maxTokens: 700,
      label: "page helper",
    });
  });

  return router;
}
