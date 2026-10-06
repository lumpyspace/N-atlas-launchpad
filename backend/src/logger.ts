/**
 * Tiny logger with one important job beyond printing: it NEVER logs secrets.
 *
 * We redact anything that looks like an API key / bearer token / query-string
 * secret before it reaches the console, so that logging a failed N-ATLAS
 * request can never leak NATLAS_API_KEY.
 */

type Level = "info" | "warn" | "error";

/** Redact obvious secrets from arbitrary strings before logging. */
export function redact(input: string): string {
  return input
    // Authorization: Bearer <token>
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1***REDACTED***")
    // hf_... Hugging Face tokens
    .replace(/\bhf_[A-Za-z0-9]+/g, "hf_***REDACTED***")
    // ?api_key=... or &key=... in URLs
    .replace(/([?&](?:api_?key|key|token)=)[^&\s]+/gi, "$1***REDACTED***");
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${redact(msg)}`;
  const safeMeta = meta ? redact(JSON.stringify(meta)) : "";
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](safeMeta ? `${line} ${safeMeta}` : line);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
