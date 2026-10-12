/**
 * Published assistants ("sites"): set one up, try it, publish it, and let
 * visitors talk to it at /a/<slug>.
 *
 *   GET    /api/sites/status                 → { canPublish, store, reason? }
 *   POST   /api/sites/draft   { blueprint, language, knowledge? } → { config, by }
 *   POST   /api/sites/preview { config, history, sent? }          → SiteAnswer (nothing saved)
 *   POST   /api/sites         { config }                          → { slug, ownerKey }
 *   PUT    /api/sites/:slug   { config }        x-owner-key       → { slug }
 *   DELETE /api/sites/:slug                     x-owner-key
 *   GET    /api/sites/:slug/inbox               x-owner-key       → { items, usedToday, dailyLimit }
 *   GET    /api/sites/:slug/public                                → what visitors may see
 *   POST   /api/sites/:slug/chat  { history, sent? }              → SiteAnswer (orders saved)
 *
 * No accounts: publishing returns an owner key, shown once; its hash is stored.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { clientIp } from "../app.js";
import type { Brain } from "../brain/brain.js";
import { exportSlug } from "../deploy/kit.js";
import type { LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { draftConfig } from "../sites/draft.js";
import { answerVisitor, type Turn } from "../sites/runtime.js";
import { publicView, sanitizeConfig } from "../sites/sanitize.js";
import type { SiteStore } from "../sites/store.js";

const LANGS: LangCode[] = ["en", "pid", "yo", "ha", "ig"];
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const today = () => new Date().toISOString().slice(0, 10);

function parseTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns = raw
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-16)
    .map((t) => ({ role: t.role, content: String(t.content).slice(0, 2000) }) as Turn);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return null;
  return last.content.length > 1000 ? null : turns;
}

const parseSent = (raw: unknown) => (Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(-20) : []);

export function sitesRouter(
  provider: NAtlasProvider,
  brain: Brain | undefined,
  store: SiteStore | null,
  opts: { publicMode: boolean; dailyLimit?: number; publishesPerDay?: number },
): Router {
  const router = Router();
  const dailyLimit = opts.dailyLimit ?? 300;

  const owns = async (req: Request) => {
    if (!store) return null;
    const site = await store.getSite(String(req.params.slug));
    const key = req.header("x-owner-key") ?? "";
    if (!site || !key) return null;
    const a = Buffer.from(hash(key));
    const b = Buffer.from(site.ownerKeyHash);
    return a.length === b.length && timingSafeEqual(a, b) ? site : null;
  };

  router.get("/sites/status", (_req, res) => {
    res.json(
      store
        ? { canPublish: true, store: store.kind }
        : { canPublish: false, store: null, reason: "Publishing needs a database on this server (an Upstash Redis store)." },
    );
  });

  router.post("/sites/draft", async (req, res) => {
    const bp = req.body?.blueprint;
    if (!bp || typeof bp.name !== "string" || typeof bp.systemPrompt !== "string") return res.status(400).json({ error: "A blueprint is required." });
    const language: LangCode = LANGS.includes(req.body?.language) ? req.body.language : "en";
    const knowledge = typeof req.body?.knowledge === "string" ? req.body.knowledge.slice(0, 12000) : "";
    try {
      res.json(await draftConfig(bp, language, { brain, natlas: provider }, knowledge));
    } catch (err) {
      logger.error("site draft failed", { reason: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "Couldn't set up the assistant just now — please try again." });
    }
  });

  router.post("/sites/preview", async (req, res) => {
    const config = sanitizeConfig(req.body?.config);
    const history = parseTurns(req.body?.history);
    if (!config || !history) return res.status(400).json({ error: "Send { config, history: [... ending with a message under 1,000 characters] }" });
    try {
      res.json(await answerVisitor(config, history, { brain, natlas: provider }, parseSent(req.body?.sent)));
    } catch (err) {
      logger.error("site preview failed", { reason: err instanceof Error ? err.message : String(err) });
      res.status(502).json({ error: "N-ATLAS couldn't answer just now — please try again." });
    }
  });

  router.post("/sites", async (req, res) => {
    if (!store) return res.status(503).json({ error: "Publishing isn't set up on this server yet (it needs a database)." });
    const config = sanitizeConfig(req.body?.config);
    if (!config) return res.status(400).json({ error: "The assistant needs a name." });
    if (opts.publicMode && (await store.countUse(`publish:${clientIp(req)}`, today())) > (opts.publishesPerDay ?? 5)) {
      return res.status(429).json({ error: "You've published several assistants today — please try again tomorrow." });
    }
    // A readable name plus a short random part, so links can't be guessed or squatted.
    let slug = "";
    for (let i = 0; i < 5 && !slug; i++) {
      const candidate = `${exportSlug(config.name).slice(0, 32)}-${randomBytes(3).toString("hex")}`;
      if (!(await store.getSite(candidate))) slug = candidate;
    }
    const ownerKey = randomBytes(18).toString("base64url");
    const now = new Date().toISOString();
    await store.putSite({ slug, config, ownerKeyHash: hash(ownerKey), createdAt: now, updatedAt: now });
    res.json({ slug, ownerKey });
  });

  router.put("/sites/:slug", async (req, res) => {
    const site = await owns(req);
    if (!site) return res.status(403).json({ error: "That edit key doesn't match this assistant." });
    const config = sanitizeConfig(req.body?.config);
    if (!config) return res.status(400).json({ error: "The assistant needs a name." });
    await store!.putSite({ ...site, config, updatedAt: new Date().toISOString() });
    res.json({ slug: site.slug });
  });

  router.delete("/sites/:slug", async (req, res) => {
    const site = await owns(req);
    if (!site) return res.status(403).json({ error: "That edit key doesn't match this assistant." });
    await store!.deleteSite(site.slug);
    res.json({ ok: true });
  });

  router.get("/sites/:slug/inbox", async (req, res) => {
    const site = await owns(req);
    if (!site) return res.status(403).json({ error: "That edit key doesn't match this assistant." });
    res.json({ items: await store!.listInbox(site.slug), dailyLimit });
  });

  router.get("/sites/:slug/public", async (req, res) => {
    const site = store ? await store.getSite(String(req.params.slug)) : null;
    if (!site) return res.status(404).json({ error: "There's no assistant at this address." });
    res.json(publicView(site.slug, site.config));
  });

  router.post("/sites/:slug/chat", async (req, res) => {
    const site = store ? await store.getSite(String(req.params.slug)) : null;
    if (!site) return res.status(404).json({ error: "There's no assistant at this address." });
    const history = parseTurns(req.body?.history);
    if (!history) return res.status(400).json({ error: "Please keep messages under 1,000 characters." });
    if ((await store!.countUse(`site:${site.slug}`, today())) > dailyLimit) {
      return res.status(429).json({ error: "This assistant has answered all it can for today. Please come back tomorrow." });
    }
    try {
      const answer = await answerVisitor(site.config, history, { brain, natlas: provider }, parseSent(req.body?.sent));
      if (answer.order) await store!.addInbox(site.slug, answer.order);
      res.json({ ...answer, order: answer.order ? { saved: true } : undefined });
    } catch (err) {
      logger.error("site chat failed", { slug: site.slug, reason: err instanceof Error ? err.message : String(err) });
      res.status(502).json({ error: "Sorry, I can't answer just now — please try again in a minute." });
    }
  });

  return router;
}
