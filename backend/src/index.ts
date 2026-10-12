/**
 * N-ATLAS Launchpad backend, run locally: `npm run dev` (port 8787).
 * The routes live in app.ts, shared with the hosted version (api/index.mjs).
 */

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();
const { app, publicMode } = createApp(config);

app.listen(config.port, () => {
  logger.info(`N-ATLAS Launchpad backend listening on http://localhost:${config.port}${publicMode ? " (public mode)" : ""}`);
});
