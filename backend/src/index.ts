/**
 * N-ATLAS Forge backend entry point.
 *
 * A deliberately small Express REST API:
 *   GET  /api/health    -> is the app actually reaching N-ATLAS? real or mock?
 *   POST /api/generate  -> playground: prompt in, N-ATLAS completion out
 *
 * The evaluation engine (scores, pass/fail, Nigerian-context test cases) will
 * be built on top of this same provider in a later phase — it is intentionally
 * NOT here yet (see README "What is not yet implemented").
 */

import cors from "cors";
import express from "express";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createProvider } from "./providers/index.js";
import { generateRouter } from "./routes/generate.js";
import { healthRouter } from "./routes/health.js";

const config = loadConfig();
const provider = createProvider(config);

const app = express();
app.use(cors()); // dev convenience; lock this down before any real deployment
app.use(express.json({ limit: "1mb" }));

app.use("/api", healthRouter(provider));
app.use("/api", generateRouter(provider));

// Root gives a quick sanity response and points at the health check.
app.get("/", (_req, res) => {
  res.json({
    name: "N-ATLAS Forge API",
    provider: provider.name,
    isMock: provider.isMock,
    hint: "GET /api/health to verify the app -> N-ATLAS -> response chain.",
  });
});

app.listen(config.port, () => {
  logger.info(`N-ATLAS Forge backend listening on http://localhost:${config.port}`);
  if (provider.isMock) {
    logger.warn(
      "MOCK provider active — responses are NOT real N-ATLAS output. " +
        "Configure NATLAS_PROVIDER=http + NATLAS_ENDPOINT for the real model.",
    );
  }
});
