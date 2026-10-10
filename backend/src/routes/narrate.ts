/**
 * N-ATLAS writes the build guide.
 *
 *   POST /api/blueprint/narrate  { blueprint, language, sections? }  → SSE
 *     {type:"start", section}
 *     {type:"delta", section, delta}*     — N-ATLAS's text as it's written
 *     {type:"section", section, value}     — parsed and checked: use it
 *     {type:"section", section, problem}   — failed a check: keep the engine's text
 *     {type:"error", section, message}    — N-ATLAS failed (offline, timeout): stops the run
 *     {type:"done"}
 *
 * Sections are written one after another, in reading order, so the guide
 * fills in from the top.
 */

import { Router } from "express";
import {
  checkSection,
  featurePrompt,
  parseFeature,
  parseSection,
  sectionPrompt,
  SECTIONS,
  type SectionId,
  type SectionPrompt,
} from "../blueprint/narrate.js";
import type { Blueprint } from "../blueprint/types.js";
import type { LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

const isLang = (v: unknown): v is LangCode => v === "en" || v === "pid" || v === "yo" || v === "ha" || v === "ig";

function isBlueprint(v: any): v is Blueprint {
  return (
    v &&
    typeof v.name === "string" &&
    typeof v.purpose === "string" &&
    Array.isArray(v.primaryTasks) &&
    v.buildPlan &&
    Array.isArray(v.buildPlan.features) &&
    Array.isArray(v.buildPlan.mvp) &&
    v.buildPlan.useCase
  );
}

export function narrateRouter(provider: NAtlasProvider): Router {
  const router = Router();

  router.post("/blueprint/narrate", async (req, res) => {
    const bp = req.body?.blueprint;
    if (!isBlueprint(bp)) return res.status(400).json({ error: "A blueprint with a build plan is required." });
    const language: LangCode = isLang(req.body?.language) ? req.body.language : "en";
    const wanted: SectionId[] = Array.isArray(req.body?.sections)
      ? SECTIONS.filter((s) => req.body.sections.includes(s))
      : [...SECTIONS];

    const sse = openSse(res);

    /** One N-ATLAS call, streamed to the page. `truncated`: it stopped at the token limit. */
    async function write(section: SectionId, p: SectionPrompt, prefix = ""): Promise<{ text: string; truncated: boolean }> {
      let text = "";
      let tokens = 0;
      if (prefix) sse.send({ type: "delta", section, delta: prefix });
      await provider.generateStream(
        p.prompt,
        { system: p.system, maxTokens: p.maxTokens, temperature: 0.3 },
        (chunk) => {
          if (chunk.type === "stats") tokens = chunk.tokensGenerated ?? 0;
          if (chunk.type !== "delta" || !chunk.delta) return;
          text += chunk.delta;
          sse.send({ type: "delta", section, delta: chunk.delta });
        },
        sse.signal,
      );
      return { text, truncated: tokens >= p.maxTokens - 1 };
    }

    try {
      for (const section of wanted) {
        if (sse.signal.aborted) break;
        if (section === "features" && !bp.buildPlan.features.length) continue;
        sse.send({ type: "start", section });
        let parsed: ReturnType<typeof parseSection>;
        try {
          if (section === "features") {
            // One feature at a time (an 8B model loses count in a long list), each retried once.
            const rows: { task: string; how: string }[] = [];
            for (let i = 0; i < bp.buildPlan.features.length && !sse.signal.aborted; i++) {
              let row: { task: string; how: string } | undefined;
              for (let attempt = 0; attempt < 2 && !row; attempt++) {
                const r = await write(section, featurePrompt(bp, i, language), `${i ? "\n" : ""}${i + 1}. `);
                row = parseFeature(r.text, r.truncated);
              }
              if (!row) break;
              rows.push(row);
            }
            parsed =
              rows.length === bp.buildPlan.features.length
                ? { value: rows }
                : { problem: `feature ${rows.length + 1} wasn't in the “name: explanation” shape` };
          } else {
            const r = await write(section, sectionPrompt(section, bp, language));
            parsed = parseSection(section, r.text, bp, r.truncated);
          }
        } catch (err) {
          if (sse.signal.aborted) break;
          const message = err instanceof Error ? err.message : String(err);
          logger.error("narrate section failed", { section, reason: message });
          // Not the section's fault (N-ATLAS offline, timed out…): stop, and let the page offer to try again.
          sse.send({ type: "error", section, message });
          break;
        }
        if (sse.signal.aborted) break;
        const problem = parsed.problem ?? (parsed.value ? checkSection(parsed.value, bp, language) : "empty");
        sse.send(problem ? { type: "section", section, problem } : { type: "section", section, value: parsed.value });
      }
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  return router;
}
