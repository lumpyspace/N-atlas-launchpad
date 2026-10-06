/**
 * Provider factory — the ONE place that decides which N-ATLAS provider is live.
 *
 * The rest of the app imports `createProvider(config)` and never constructs a
 * provider directly, so switching serving methods is a config change only.
 */

import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { HttpNAtlasProvider } from "./HttpNAtlasProvider.js";
import { MockNAtlasProvider } from "./MockNAtlasProvider.js";
import type { NAtlasProvider } from "./NAtlasProvider.js";

export function createProvider(config: AppConfig): NAtlasProvider {
  if (config.provider === "http") {
    logger.info("Using HTTP N-ATLAS provider (real integration)", {
      model: config.natlasModel,
    });
    return new HttpNAtlasProvider({
      endpoint: config.natlasEndpoint,
      apiKey: config.natlasApiKey,
      model: config.natlasModel,
      timeoutMs: config.requestTimeoutMs,
    });
  }

  logger.warn(
    "Using MOCK N-ATLAS provider. Output is NOT real N-ATLAS. " +
      "Set NATLAS_PROVIDER=http to enable the real integration.",
  );
  return new MockNAtlasProvider();
}

export * from "./NAtlasProvider.js";
