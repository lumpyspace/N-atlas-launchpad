/**
 * N-ATLAS Forge backend entry point.
 *
 * A deliberately small Express REST API:
 *   GET  /api/health    -> is the app actually reaching N-ATLAS? real or mock?
 *   POST /api/generate  -> playground: prompt in, N-ATLAS completion out
 *   GET  /api/suites    -> list evaluation suites
 *   POST /api/evaluate  -> run a suite against N-ATLAS and return scored results
 *
 * The evaluation engine (scores, pass/fail, Nigerian-context test cases) is
 * built on top of this same provider — see src/eval/.
 */

import cors from "cors";
import express from "express";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createProvider } from "./providers/index.js";
import { ProviderRef } from "./providers/ProviderRef.js";
import { generateRouter } from "./routes/generate.js";
import { healthRouter } from "./routes/health.js";
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

const config = loadConfig();
const provider = new ProviderRef(createProvider(config));

const app = express();
app.use(cors()); // dev convenience; lock this down before any real deployment
app.use(express.json({ limit: "1mb" }));

app.use("/api", healthRouter(provider));
app.use("/api", generateRouter(provider));
app.use("/api", blueprintRouter());
app.use("/api", evaluateRouter(provider));
app.use("/api", securityRouter(provider));
app.use("/api", improveRouter());
app.use("/api", modeRouter(provider));
app.use("/api", compareRouter(provider, config));
app.use("/api", designRouter(provider));
app.use("/api", promptRouter());
app.use("/api", narrateRouter(provider));
app.use("/api", doctorRouter(provider));

// Root gives a quick sanity response and points at the health check.
app.get("/", (_req, res) => {
  res.json({
    name: "N-ATLAS Launchpad API",
    provider: provider.name,
    isMock: provider.isMock,
    hint: "GET /api/health to verify the app -> N-ATLAS -> response chain.",
  });
});

app.listen(config.port, () => {
  logger.info(`N-ATLAS Launchpad backend listening on http://localhost:${config.port}`);
});
