/**
 * Minimal Server-Sent Events helper shared by the streaming routes.
 *
 * Each event is one `data: {json}\n\n` frame. The returned `signal` aborts when
 * the browser goes away, so long runs stop calling the model for nobody.
 */

import type { Response } from "express";

export interface SseStream {
  send: (event: unknown) => void;
  end: () => void;
  signal: AbortSignal;
}

export function openSse(res: Response): SseStream {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const controller = new AbortController();
  // `res` (not `req`) "close" fires when the client disconnects; `req` would
  // fire as soon as the request body had been read.
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  // Keep idle proxies from closing the connection during slow model calls.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, 15_000);

  return {
    send(event) {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
    signal: controller.signal,
  };
}
