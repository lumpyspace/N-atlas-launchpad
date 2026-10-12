/**
 * The build guide in the project's language. With an assistant model (Groq,
 * Gemini…) it writes each section in English and N-ATLAS says it in the
 * project's language; otherwise N-ATLAS writes it directly.
 *
 *   POST /api/blueprint/narrate  { blueprint, language, sections? }  → SSE
 *     {type:"start", section}
 *     {type:"delta", section, delta}*     — N-ATLAS's text as it's written
 *     {type:"section", section, value, by} — parsed and checked: use it (by: who thought, who wrote it)
 *     {type:"section", section, problem, by} — failed a check: keep the engine's text
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
import type { Brain } from "../brain/brain.js";
import { speakIn } from "../brain/relay.js";
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

export function narrateRouter(provider: NAtlasProvider, brain?: Brain): Router {
  const router = Router();

  router.post("/blueprint/narrate", async (req, res) => {
    const bp = req.body?.blueprint;
    if (!isBlueprint(bp)) return res.status(400).json({ error: "A blueprint with a build plan is required." });
    const language: LangCode = isLang(req.body?.language) ? req.body.language : "en";
    const wanted: SectionId[] = Array.isArray(req.body?.sections)
      ? SECTIONS.filter((s) => req.body.sections.includes(s))
      : [...SECTIONS];

    const sse = openSse(res);
    // The assistant model writes when it can; N-ATLAS then says it in the project's language.
    let useBrain = !!brain?.available();

    /** One section by the assistant model, in English, then in the project's language. */
    async function viaBrain(section: SectionId): Promise<{ parsed: ReturnType<typeof parseSection>; text: string; by: { brain: string; voice: string } }> {
      const ask = async (p: SectionPrompt) =>
        brain!.chat(
          [
            { role: "system", content: p.system },
            { role: "user", content: p.prompt },
          ],
          { maxTokens: p.maxTokens * 2, temperature: 0.3, signal: sse.signal },
        );
      let brainName = "";
      let voice = "N-ATLAS";
      const say = async (english: string) => {
        const r = await speakIn({ brain: brain!, natlas: provider, language, english, brainName, keep: [bp.name], signal: sse.signal });
        if (r.voice !== "N-ATLAS") voice = r.voice;
        return r.text;
      };
      if (section === "features") {
        // One feature per request (all at once): each "name: explanation" is checked on its own.
        const english = await Promise.all(bp.buildPlan.features.map((_: unknown, i: number) => ask(featurePrompt(bp, i, "en", "assistant"))));
        brainName = english[0]?.provider ?? "";
        const rows = english.map((r) => parseFeature(r.text));
        if (rows.some((r) => !r)) return { parsed: { problem: "a feature wasn't in the “name: explanation” shape" }, text: "", by: { brain: brainName, voice: brainName } };
        const said = await Promise.all(rows.map(async (r) => ({ task: await say(r!.task), how: await say(r!.how) })));
        if (language === "en") voice = brainName;
        return { parsed: { value: said }, text: said.map((r, i) => `${i + 1}. ${r.task}: ${r.how}`).join("\n"), by: { brain: brainName, voice } };
      }
      const r = await ask(sectionPrompt(section, bp, "en", "assistant"));
      brainName = r.provider;
      if (language === "en") voice = brainName;
      if (section === "conversation") {
        // Say the two lines separately, so the User:/App: labels stay as they are.
        const english = parseSection(section, r.text, bp, false);
        const turn = english.value as { user: string; app: string } | undefined;
        if (!turn) return { parsed: english, text: r.text, by: { brain: brainName, voice: brainName } };
        const said = { user: await say(turn.user), app: await say(turn.app) };
        return { parsed: { value: said }, text: `User: ${said.user}\nApp: ${said.app}`, by: { brain: brainName, voice } };
      }
      const text = await say(r.text.trim());
      return { parsed: parseSection(section, text, bp, false), text, by: { brain: brainName, voice } };
    }

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

    /** Write one section and send it. "stop" ends the run (N-ATLAS offline, or the page went away). */
    async function one(section: SectionId): Promise<"stop" | void> {
      if (sse.signal.aborted) return "stop";
      sse.send({ type: "start", section });
      let parsed: ReturnType<typeof parseSection> | undefined;
      let by: { brain: string; voice: string } | undefined;
      if (useBrain) {
        try {
          const r = await viaBrain(section);
          parsed = r.parsed;
          by = r.by;
          if (r.text) sse.send({ type: "delta", section, delta: r.text });
        } catch (err) {
          if (sse.signal.aborted) return "stop";
          // The assistant model failed (quota, network): N-ATLAS writes this and the rest on its own.
          logger.error("narrate: assistant model failed; N-ATLAS writes alone", { section, reason: err instanceof Error ? err.message : String(err) });
          useBrain = false;
        }
      }
      try {
        if (parsed) {
          /* written by the assistant model */
        } else if (section === "features") {
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
        if (sse.signal.aborted) return "stop";
        const message = err instanceof Error ? err.message : String(err);
        logger.error("narrate section failed", { section, reason: message });
        // Not the section's fault (N-ATLAS offline, timed out…): stop, and let the page offer to try again.
        sse.send({ type: "error", section, message });
        return "stop";
      }
      if (sse.signal.aborted || !parsed) return "stop";
      const problem = parsed.problem ?? (parsed.value ? checkSection(parsed.value, bp, language) : "empty");
      by ??= { brain: "", voice: "N-ATLAS" };
      sse.send(problem ? { type: "section", section, problem, by } : { type: "section", section, value: parsed.value, by });
    }

    try {
      const todo = wanted.filter((s) => s !== "features" || bp.buildPlan.features.length > 0);
      if (useBrain) {
        // The assistant model answers in seconds: three sections at a time.
        let next = 0;
        let stop = false;
        await Promise.all(
          Array.from({ length: 3 }, async () => {
            while (!stop && next < todo.length) if ((await one(todo[next++])) === "stop") stop = true;
          }),
        );
      } else {
        // N-ATLAS alone: one after another, in reading order, so the guide fills in from the top.
        for (const section of todo) if ((await one(section)) === "stop") break;
      }
    } finally {
      sse.send({ type: "done" });
      sse.end();
    }
  });

  return router;
}
