import { useEffect, useRef, useState } from "react";
import { draftSite, publishSite, siteStatus, translateSite, unpublishSite, updateSite, type AssistantConfig } from "../../api";
import { useProject, type SiteState } from "../../state/ProjectContext";
import type { KDoc } from "../../utils/knowledge";

/** The text of the project's documents, for the assistant's notes. */
export function docsText(docs: KDoc[] = []): string {
  return docs
    .map((d) => `${d.name}:\n${d.chunks.map((c) => c.text).join("\n")}`)
    .join("\n\n")
    .slice(0, 12000);
}

/** The config as published ("reviewed" marks go too: the assistant only learns from checked pages). */
export function publishable(c: AssistantConfig): AssistantConfig {
  return c;
}
export const fingerprint = (c: AssistantConfig) => JSON.stringify(c);

/** Blanks (…) the owner still has to fill in, across the pages. */
export function countBlanks(c: AssistantConfig): number {
  const re = /…|\.\.\.|_{3,}/g;
  let n = 0;
  for (const p of c.pages)
    for (const s of p.sections as any[]) {
      for (const f of ["heading", "text"]) n += (String(s[f] ?? "").match(re) ?? []).length;
      if (s.type === "faq") for (const i of s.items) n += ((i.q + i.a).match(re) ?? []).length;
    }
  return n;
}

/** A fingerprint of everything visitors read in the main language: a translation made from another is out of date. */
export function sourceOf(c: AssistantConfig): string {
  const text = JSON.stringify({
    t: c.tagline,
    g: c.greeting,
    p: c.pages.map((p) => [p.id, p.title, p.sections]),
    b: (c.posts ?? []).map((p) => [p.id, p.title, p.body, p.status]),
  });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + text.length.toString(36);
}

export type TranslationState = "ready" | "stale" | "missing";
export function translationState(c: AssistantConfig, lang: string): TranslationState {
  const tr = c.translations?.[lang];
  return !tr ? "missing" : tr.source === sourceOf(c) ? "ready" : "stale";
}

let statusCache: Promise<{ canPublish: boolean; reason?: string }> | null = null;

/**
 * The project's site, WordPress-style: its config (edited by every admin
 * screen), whether it's published, and Publish / Update / Take offline.
 */
export function useSite() {
  const { state, dispatch } = useProject();
  const site = state.site;
  const siteRef = useRef(site);
  siteRef.current = site;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ canPublish: boolean; reason?: string } | null>(null);
  const [translating, setTranslating] = useState<string[]>([]);

  useEffect(() => {
    statusCache ??= siteStatus().catch(() => ({ canPublish: false, reason: "Launchpad's server can't be reached." }));
    statusCache.then(setStatus);
  }, []);

  const save = (next: SiteState | undefined) => {
    siteRef.current = next;
    dispatch({ type: "setSite", site: next });
  };
  const setConfig = (f: (c: AssistantConfig) => AssistantConfig) => {
    const cur = siteRef.current;
    if (cur) save({ ...cur, config: f(cur.config) });
  };

  async function create(signal?: AbortSignal) {
    if (!state.blueprint) return;
    setBusy(true);
    setError(null);
    try {
      const r = await draftSite(state.blueprint, state.language, docsText(state.knowledge));
      if (signal?.aborted) return;
      // Pages Groq wrote are drafts until the owner checks them.
      const config = { ...r.config, pages: r.config.pages.map((p) => ({ ...p, reviewed: r.by === "Launchpad" })) };
      save({ config, by: r.by });
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  async function publish() {
    const cur = siteRef.current;
    if (!cur) return;
    setBusy(true);
    setError(null);
    try {
      const config = publishable(cur.config);
      if (cur.slug && cur.ownerKey) {
        await updateSite(cur.slug, cur.ownerKey, config);
        save({ ...cur, publishedConfig: fingerprint(cur.config), publishedAt: new Date().toISOString() });
      } else {
        const r = await publishSite(config);
        save({ ...cur, slug: r.slug, ownerKey: r.ownerKey, publishedConfig: fingerprint(cur.config), publishedAt: new Date().toISOString() });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    const cur = siteRef.current;
    if (!cur?.slug || !cur.ownerKey) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishSite(cur.slug, cur.ownerKey);
      save({ config: cur.config, by: cur.by });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Translate the site into an extra language (N-ATLAS, with Groq's help on tricky lines). */
  async function translate(lang: string) {
    const cur = siteRef.current;
    if (!cur) return;
    // The fingerprint of what was translated — edits made meanwhile leave it "needs updating".
    const source = sourceOf(cur.config);
    setTranslating((l) => [...l, lang]);
    setError(null);
    try {
      const tr = await translateSite(publishable(cur.config), lang);
      setConfig((cfg) => ({ ...cfg, translations: { ...(cfg.translations ?? {}), [lang]: { ...tr, source } } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating((l) => l.filter((x) => x !== lang));
    }
  }

  const live = !!site?.slug;
  return {
    site,
    config: site?.config,
    setConfig,
    create,
    publish,
    unpublish,
    busy,
    error,
    status,
    live,
    changed: live && site!.publishedConfig !== fingerprint(site!.config),
    link: live ? `${window.location.origin}/a/${site!.slug}` : "",
    unreviewed: site ? site.config.pages.filter((p) => !p.reviewed).length : 0,
    blanks: site ? countBlanks(site.config) : 0,
    translate,
    translating,
    /** Extra languages whose translation is missing or out of date. */
    untranslated: site ? (site.config.languages ?? []).filter((l) => translationState(site.config, l) !== "ready") : [],
  };
}
