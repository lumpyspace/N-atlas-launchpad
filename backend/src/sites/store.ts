/**
 * Where published assistants and their inboxes live.
 *
 * - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL / _TOKEN — or Vercel's
 *   KV_REST_API_URL / _TOKEN — are set: the hosted Launchpad.
 * - A JSON file (backend/.data/sites.json) on your own computer.
 * - Memory, for tests.
 * On a public Launchpad without a database, publishing is switched off:
 * a serverless function forgets files between requests.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cleanSecret } from "../config.js";
import type { InboxItem, Site } from "./types.js";

export interface SiteStore {
  readonly kind: "upstash" | "file" | "memory";
  getSite(slug: string): Promise<Site | null>;
  putSite(site: Site): Promise<void>;
  deleteSite(slug: string): Promise<void>;
  addInbox(slug: string, item: InboxItem): Promise<void>;
  listInbox(slug: string, limit?: number): Promise<InboxItem[]>;
  /** Count one use today; returns today's count after it. */
  countUse(key: string, day: string): Promise<number>;
}

const INBOX_MAX = 500;

export class MemoryStore implements SiteStore {
  readonly kind: "memory" | "file" = "memory";
  protected data: { sites: Record<string, Site>; inbox: Record<string, InboxItem[]>; uses: Record<string, number> } = { sites: {}, inbox: {}, uses: {} };
  protected save(): void {}
  async getSite(slug: string) {
    return this.data.sites[slug] ?? null;
  }
  async putSite(site: Site) {
    this.data.sites[site.slug] = site;
    this.save();
  }
  async deleteSite(slug: string) {
    delete this.data.sites[slug];
    delete this.data.inbox[slug];
    this.save();
  }
  async addInbox(slug: string, item: InboxItem) {
    this.data.inbox[slug] = [item, ...(this.data.inbox[slug] ?? [])].slice(0, INBOX_MAX);
    this.save();
  }
  async listInbox(slug: string, limit = 100) {
    return (this.data.inbox[slug] ?? []).slice(0, limit);
  }
  async countUse(key: string, day: string) {
    const k = `${key}:${day}`;
    // Keep only today's counters.
    for (const old of Object.keys(this.data.uses)) if (!old.endsWith(`:${day}`)) delete this.data.uses[old];
    this.data.uses[k] = (this.data.uses[k] ?? 0) + 1;
    this.save();
    return this.data.uses[k];
  }
}

export class FileStore extends MemoryStore {
  readonly kind = "file" as const;
  constructor(private readonly path: string) {
    super();
    try {
      if (existsSync(path)) this.data = { ...this.data, ...JSON.parse(readFileSync(path, "utf8")) };
    } catch {
      /* unreadable: start empty */
    }
  }
  protected save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 1));
  }
}

/** Upstash Redis over its REST API (no client library needed). */
export class UpstashStore implements SiteStore {
  readonly kind = "upstash" as const;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url.replace(/\/+$/, ""), {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map(String)),
      // A database that doesn't answer shouldn't keep the person waiting.
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || data.error) throw new Error(`database: ${data.error ?? `HTTP ${res.status}`}`);
    return data.result as T;
  }
  async getSite(slug: string) {
    const raw = await this.cmd<string | null>("GET", `site:${slug}`);
    return raw ? (JSON.parse(raw) as Site) : null;
  }
  async putSite(site: Site) {
    await this.cmd("SET", `site:${site.slug}`, JSON.stringify(site));
  }
  async deleteSite(slug: string) {
    await this.cmd("DEL", `site:${slug}`, `inbox:${slug}`);
  }
  async addInbox(slug: string, item: InboxItem) {
    await this.cmd("LPUSH", `inbox:${slug}`, JSON.stringify(item));
    await this.cmd("LTRIM", `inbox:${slug}`, 0, INBOX_MAX - 1);
  }
  async listInbox(slug: string, limit = 100) {
    const rows = await this.cmd<string[]>("LRANGE", `inbox:${slug}`, 0, limit - 1);
    return (rows ?? []).map((r) => JSON.parse(r) as InboxItem);
  }
  async countUse(key: string, day: string) {
    const k = `use:${key}:${day}`;
    const n = await this.cmd<number>("INCR", k);
    if (n === 1) await this.cmd("EXPIRE", k, 2 * 86400);
    return n;
  }
}

/** The store for this environment, or null when publishing can't work here. */
export function storeFromEnv(env: NodeJS.ProcessEnv, publicMode: boolean, filePath: string): SiteStore | null {
  // Forgive quotes or a pasted `NAME=` around the values, as for the API keys.
  const url =
    cleanSecret(env.UPSTASH_REDIS_REST_URL, "UPSTASH_REDIS_REST_URL") || cleanSecret(env.KV_REST_API_URL, "KV_REST_API_URL");
  const token =
    cleanSecret(env.UPSTASH_REDIS_REST_TOKEN, "UPSTASH_REDIS_REST_TOKEN") || cleanSecret(env.KV_REST_API_TOKEN, "KV_REST_API_TOKEN");
  if (url && token) return new UpstashStore(url, token);
  if (publicMode) return null;
  return new FileStore(filePath);
}
