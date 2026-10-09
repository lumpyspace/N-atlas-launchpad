/**
 * Compare routes — the promptfoo-style grid: the same test cases run against
 * several variants (system prompt × temperature × model), side by side.
 *
 *   GET  /api/models          -> models a variant can use
 *   POST /api/compare/stream  -> SSE: {type:"start",total} → {type:"cell",caseId,variantId,result}*
 *                                → {type:"done", summary}
 */

import { Router } from "express";
import type { AppConfig } from "../config.js";
import { parseCustomCases } from "../eval/custom.js";
import { runCase } from "../eval/runner.js";
import type { CaseResult } from "../eval/types.js";
import { logger } from "../logger.js";
import { HttpNAtlasProvider } from "../providers/HttpNAtlasProvider.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { openSse } from "./sse.js";

export const NATLAS_MODEL_ID = "natlas";
const MAX_VARIANTS = 3;
const MAX_CASES = 50;
const REPLY_TOKENS = 200;

interface Variant {
  id: string;
  label: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
}

function parseVariants(input: unknown, modelIds: Set<string>): Variant[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_VARIANTS).flatMap((raw: any, i): Variant[] => {
    const modelId = typeof raw?.modelId === "string" && modelIds.has(raw.modelId) ? raw.modelId : NATLAS_MODEL_ID;
    const t = Number(raw?.temperature);
    return [
      {
        id: typeof raw?.id === "string" ? raw.id.slice(0, 40) : `v${i + 1}`,
        label: typeof raw?.label === "string" && raw.label.trim() ? raw.label.slice(0, 60) : `Variant ${i + 1}`,
        modelId,
        systemPrompt: typeof raw?.systemPrompt === "string" ? raw.systemPrompt.slice(0, 20_000) : "",
        temperature: Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : 0.2,
      },
    ];
  });
}

export function compareRouter(provider: NAtlasProvider, config: AppConfig): Router {
  const router = Router();

  // Build the extra providers once; they share N-ATLAS's endpoint unless configured otherwise.
  const extras = new Map<string, { label: string; model: string; provider: NAtlasProvider }>();
  for (const m of config.compareModels) {
    const endpoint = m.endpoint || config.natlasEndpoint;
    if (!endpoint) continue;
    extras.set(m.id, {
      label: m.label,
      model: m.model,
      provider: new HttpNAtlasProvider({
        endpoint,
        apiKey: m.apiKey || (m.endpoint ? "" : config.natlasApiKey),
        model: m.model,
        timeoutMs: config.requestTimeoutMs,
      }),
    });
  }

  router.get("/models", (_req, res) => {
    res.json({
      models: [
        { id: NATLAS_MODEL_ID, label: "N-ATLAS", model: config.natlasModel },
        ...[...extras.entries()].map(([id, m]) => ({ id, label: m.label, model: m.model })),
      ],
    });
  });

  router.post("/compare/stream", async (req, res) => {
    const modelIds = new Set([NATLAS_MODEL_ID, ...extras.keys()]);
    const variants = parseVariants(req.body?.variants, modelIds);
    const cases = parseCustomCases(req.body?.cases).slice(0, MAX_CASES);
    if (variants.length < 2) {
      return res.status(400).json({ error: "Add at least two variants to compare." });
    }
    if (cases.length === 0) {
      return res.status(400).json({ error: "No test cases to run. Save some from the Playground first." });
    }

    const sse = openSse(res);
    const total = cases.length * variants.length;
    sse.send({ type: "start", total, variants: variants.map(({ id, label }) => ({ id, label })) });
    logger.info("Starting compare run", { cases: cases.length, variants: variants.length });

    const perVariant = new Map<string, CaseResult[]>(variants.map((v) => [v.id, []]));
    let done = 0;
    try {
      // Row by row, so the grid fills left-to-right as results arrive.
      outer: for (const tc of cases) {
        for (const v of variants) {
          if (sse.signal.aborted) break outer;
          const p = v.modelId === NATLAS_MODEL_ID ? provider : extras.get(v.modelId)!.provider;
          const result = await runCase(tc, p, {
            systemOverride: v.systemPrompt,
            temperature: v.temperature,
            maxTokens: REPLY_TOKENS,
            signal: sse.signal,
          });
          if (!result) break outer;
          perVariant.get(v.id)!.push(result);
          done += 1;
          sse.send({ type: "cell", caseId: tc.id, variantId: v.id, done, total, result });
        }
      }
      const summary = variants.map((v) => {
        const rs = perVariant.get(v.id)!;
        const passed = rs.filter((r) => r.passed).length;
        const avgLatencyMs = rs.length ? Math.round(rs.reduce((s, r) => s + r.latencyMs, 0) / rs.length) : 0;
        return { variantId: v.id, total: rs.length, passed, avgLatencyMs };
      });
      sse.send({ type: "done", summary, partial: done < total });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("compare stream failed", { reason: message });
      sse.send({ type: "error", message });
    } finally {
      sse.end();
    }
  });

  return router;
}
