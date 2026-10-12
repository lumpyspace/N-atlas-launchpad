/**
 * Check a live app like its first visitor would: the page opens, a question
 * gets an answer from N-ATLAS, and the safety checks in code are switched on
 * (an over-long message is refused). Works for any exported app, wherever it's
 * hosted.
 *
 * On a public Launchpad this fetches URLs people type in, so addresses inside
 * the server's own network are refused unless local checks are allowed
 * (`allowPrivate`, on for a Launchpad running on the developer's computer).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface LiveCheck {
  url: string;
  checkedAt: string;
  page: { ok: boolean; ms?: number; title?: string; problem?: string };
  chat: { ok: boolean; ms?: number; reply?: string; problem?: string };
  /** The server refused a message over its length limit. */
  guards: { ok: boolean; problem?: string };
}

export class CheckError extends Error {}

/** Loopback, private, link-local and other addresses that aren't the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** The app's base URL, tidied — or a CheckError saying what's wrong with it. */
export async function checkableUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) && !/^https?:\/\//i.test(raw.trim())) throw new CheckError("Use an http(s) address.");
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new CheckError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CheckError("Use an http(s) address.");
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
    if (!ips.length) throw new CheckError("That address doesn't exist (no DNS record).");
    if (ips.some(isPrivateAddress)) throw new CheckError("That address is on a private network; use your app's public link.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function timed(url: URL, init: RequestInit, timeoutMs: number, signal?: AbortSignal) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    // No redirects: a redirect could point anywhere, including inside our network.
    const res = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal });
    const text = (await res.text()).slice(0, 200_000);
    return { res, text, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const why = (err: unknown) =>
  err instanceof Error && err.name === "AbortError" ? "no answer in time" : err instanceof Error ? (err.cause as Error)?.message ?? err.message : String(err);

export async function checkLiveApp(
  raw: string,
  message: string,
  opts: { allowPrivate: boolean; signal?: AbortSignal; timeoutMs?: number },
): Promise<LiveCheck> {
  const base = await checkableUrl(raw, opts.allowPrivate);
  const out: LiveCheck = { url: base.href.replace(/\/$/, ""), checkedAt: new Date().toISOString(), page: { ok: false }, chat: { ok: false }, guards: { ok: false } };
  // A sleeping app (Modal, Render free) takes a while to wake on the first request.
  const slow = opts.timeoutMs ?? 120_000;

  try {
    const { res, text, ms } = await timed(base, { headers: { accept: "text/html" } }, slow, opts.signal);
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    out.page = res.ok && /<html/i.test(text) ? { ok: true, ms, title } : { ok: false, ms, problem: res.ok ? "the address answers, but not with a web page" : `HTTP ${res.status}` };
  } catch (err) {
    out.page = { ok: false, problem: why(err) };
    return out; // nothing there: the other checks would only repeat it
  }

  const chat = new URL("api/chat", base);
  const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const { res, text, ms } = await timed(chat, post({ message }), slow, opts.signal);
    const data = JSON.parse(text || "{}") as { reply?: string; error?: string };
    out.chat = res.ok && data.reply ? { ok: true, ms, reply: data.reply.slice(0, 600) } : { ok: false, ms, problem: data.error ?? `HTTP ${res.status}` };
  } catch (err) {
    out.chat = { ok: false, problem: err instanceof SyntaxError ? "the chat answered with something other than JSON" : why(err) };
  }

  try {
    const { res } = await timed(chat, post({ message: "x".repeat(1001) }), 30_000, opts.signal);
    out.guards = res.status === 400 ? { ok: true } : { ok: false, problem: `an over-long message got HTTP ${res.status}, not 400` };
  } catch (err) {
    out.guards = { ok: false, problem: why(err) };
  }
  return out;
}
