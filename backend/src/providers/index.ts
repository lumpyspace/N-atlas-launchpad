import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { HttpNAtlasProvider } from "./HttpNAtlasProvider.js";
import type { NAtlasProvider } from "./NAtlasProvider.js";

export function createProvider(config: AppConfig): NAtlasProvider {
  logger.info("Using HTTP N-ATLAS provider", {
    endpoint: config.natlasEndpoint || "(not configured — set NATLAS_ENDPOINT or use /api/mode)",
    model: config.natlasModel,
  });
  return new HttpNAtlasProvider({
    endpoint: config.natlasEndpoint,
    apiKey: config.natlasApiKey,
    model: config.natlasModel,
    timeoutMs: config.requestTimeoutMs,
    repetitionPenalty: config.repetitionPenalty,
  });
}

export * from "./NAtlasProvider.js";
