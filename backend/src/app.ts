/**
 * The Launchpad API as an Express app, without listening — so the same app
 * runs locally (src/index.ts) and as a serverless function (api/index.mjs on
 * Vercel).
 *
 * Public mode (on Vercel, or LAUNCHPAD_PUBLIC=1) is for a hosted Launchpad
 * that anyone with the link can open: the N-ATLAS server and the assistant
 * model are the host's, so visitors can't switch the server, and each
 * visitor's model calls are rate-limited.
 */

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { loadConfig, type AppConfig } from "./config.js";
import { createProvider } from "./providers/index.js";
import { ProviderRef } from "./providers/ProviderRef.js";
import type { HealthStatus } from "./providers/NAtlasProvider.js";
import { generateRouter } from "./routes/generate.js";
import { evaluateRouter } from "./routes/evaluate.js";
import { blueprintRouter } from "./routes/blueprint.js";
import { securityRouter } from "./routes/security.js";
import { improveRouter } from "./routes/improve.js";
import { modeRouter } from "./routes/mode.js";
import { compareRouter } from "./routes/compare.js";
import { designRouter } from "./routes/design.js";
import { promptRouter } from "./routes/prompt.js";
import { narrateRouter } from "./routes/narrate.js";
import { doctorRouter } from "./routes/doctor.js";
import { deployRouter } from "./routes/deploy.js";
import { helpRouter } from "./routes/help.js";
import { Brain, providersFromEnv } from "./brain/brain.js";

export function isPublic(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LAUNCHPAD_PUBLIC === "1" || (!!env.VERCEL && env.LAUNCHPAD_PUBLIC !== "0");
}

/** The visitor's address: the platform's header when behind one, else the socket's. */
export function clientIp(req: Request): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Per-visitor limits on requests that call a model: a short burst limit and an
 * hourly one. In memory: on serverless each warm instance keeps its own count,
 * which still stops one browser from running the host's GPU all day.
 */
export function rateLimit(perMinute: number, perHour: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();
    const ip = clientIp(req);
    const t = now();
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < 3600_000);
    const lastMinute = recent.filter((x) => t - x < 60_000).length;
    if (lastMinute >= perMinute || recent.length >= perHour) {
      const wait = lastMinute >= perMinute ? "a minute" : "a while";
      return res.status(429).json({ error: `This public demo limits how often each visitor can call N-ATLAS. Please wait ${wait} and try again.` });
    }
    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value!);
    next();
  };
}

export function createApp(config: AppConfig = loadConfig(), env: NodeJS.ProcessEnv = process.env) {
  const publicMode = isPublic(env);
  const provider = new ProviderRef(createProvider(config));
  // Optional assistant model (Gemini, Groq…) for Launchpad's own helper jobs; keys stay on the server.
  const brain = new Brain(providersFromEnv(env), Number(env.BRAIN_DAILY_LIMIT ?? 500));

  const app = express();
  app.disable("x-powered-by");
  // Locally the Vite dev server calls from another port; a hosted Launchpad serves the page and API from one origin.
  if (!publicMode) app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Health: sends N-ATLAS a sample message, so on a public site every visitor's
  // page load would call the model — share one result for a minute instead.
  // A failure isn't kept (the GPU may be waking), and visitors arriving
  // together share one check instead of each waking the server.
  let cached: { at: number; status: HealthStatus } | null = null;
  let pending: Promise<HealthStatus> | null = null;
  app.get("/api/health", async (_req, res) => {
    if (!publicMode || !cached || Date.now() - cached.at > (cached.status.ok ? 60_000 : 5_000)) {
      pending ??= provider.health().finally(() => (pending = null));
      const status = { ...(await pending) };
      // Say which kind of key problem it is (never the key itself).
      if (!status.ok && /HTTP 401|HTTP 403/.test(status.detail)) {
        status.detail += provider.connection()?.apiKey
          ? " — the server refused NATLAS_API_KEY: check it matches the key your N-ATLAS server expects."
          : " — no NATLAS_API_KEY is set on this server.";
      }
      cached = { at: Date.now(), status };
    }
    res.status(cached.status.ok ? 200 : 503).json({ ...cached.status, public: publicMode });
  });

  if (publicMode) {
    app.use("/api", rateLimit(Number(env.PUBLIC_PER_MINUTE ?? 20), Number(env.PUBLIC_PER_HOUR ?? 300)));
  }
  app.use("/api", generateRouter(provider));
  app.use("/api", blueprintRouter(brain));
  app.use("/api", evaluateRouter(provider));
  app.use("/api", securityRouter(provider));
  app.use("/api", improveRouter());
  // Switching the N-ATLAS server is for your own Launchpad only: on a public one it
  // would let a visitor point the host's server at any address.
  if (publicMode) {
    app.post("/api/mode", (_req, res) => res.status(403).json({ error: "This is a public demo: it always uses the host's N-ATLAS server." }));
  } else {
    app.use("/api", modeRouter(provider, config));
  }
  app.use("/api", compareRouter(provider, config));
  app.use("/api", designRouter(provider, brain));
  // What the assistant model is (never its keys).
  app.get("/api/brain", (_req, res) => res.json(brain.status()));
  app.use("/api", promptRouter());
  app.use("/api", narrateRouter(provider, brain));
  app.use("/api", doctorRouter(provider));
  app.use("/api", deployRouter(provider, brain, publicMode));
  app.use("/api", helpRouter(provider, brain));

  // Root gives a quick sanity response and points at the health check.
  app.get("/api", (_req, res) => {
    res.json({
      name: "N-ATLAS Launchpad API",
      provider: provider.name,
      isMock: provider.isMock,
      public: publicMode,
      hint: "GET /api/health to verify the app -> N-ATLAS -> response chain.",
    });
  });

  return { app, provider, brain, publicMode };
}
