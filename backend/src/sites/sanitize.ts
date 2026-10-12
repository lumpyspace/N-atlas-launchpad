/**
 * A site config as sent by a browser: trimmed to sane sizes, every field
 * checked, and the assistant's instructions always carrying the security
 * rules and a reference code (the leak check needs it).
 */

import { randomUUID } from "node:crypto";
import type { LangCode } from "../eval/lang.js";
import { hardenSystemPrompt } from "../improve/harden.js";
import { makeCanary } from "../shared/prompt.js";
import { EMPTY_BLOCKS, THEMES, type AssistantConfig, type Page, type Post, type Section, type ThemeId } from "./types.js";

const LANGS: LangCode[] = ["en", "yo", "ha", "ig"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function section(raw: any): Section | null {
  const heading = str(raw?.heading, 120);
  switch (raw?.type) {
    case "hero":
      return { type: "hero", heading, text: str(raw.text, 600), button: ["chat", "order", "whatsapp", "none"].includes(raw.button) ? raw.button : "chat" };
    case "text":
      return { type: "text", heading, text: str(raw.text, 6000) };
    case "faq":
      return {
        type: "faq",
        heading,
        items: (Array.isArray(raw.items) ? raw.items : [])
          .slice(0, 30)
          .map((i: any) => ({ q: str(i?.q, 200), a: str(i?.a, 1200) }))
          .filter((i: { q: string }) => i.q),
      };
    case "prices":
      return { type: "prices", heading };
    case "contact":
      return { type: "contact", heading };
    case "posts":
      return { type: "posts", heading, count: Math.max(1, Math.min(20, Math.round(Number(raw.count) || 6))) };
    default:
      return null;
  }
}

export function sanitizePages(raw: unknown, name: string): Page[] {
  const used = new Set<string>();
  const pages = (Array.isArray(raw) ? raw : []).slice(0, 12).map((p: any, i: number) => {
    let slug = i === 0 ? "" : slugify(str(p?.slug, 40) || str(p?.title, 40)) || `page-${i + 1}`;
    while (used.has(slug)) slug = `${slug}-${i + 1}`;
    used.add(slug);
    return {
      id: str(p?.id, 40) || randomUUID().slice(0, 8),
      title: str(p?.title, 60) || (i === 0 ? "Home" : `Page ${i + 1}`),
      slug,
      inMenu: p?.inMenu !== false,
      reviewed: p?.reviewed !== false,
      sections: (Array.isArray(p?.sections) ? p.sections : []).slice(0, 20).map(section).filter((s: Section | null): s is Section => !!s),
    };
  });
  return pages.length ? pages : [{ id: "home", title: "Home", slug: "", inMenu: true, sections: [{ type: "hero", heading: name, text: "", button: "chat" }] }];
}

export function sanitizePosts(raw: unknown): Post[] {
  const used = new Set<string>();
  return (Array.isArray(raw) ? raw : []).slice(0, 200).map((p: any, i: number) => {
    let slug = slugify(str(p?.slug, 60) || str(p?.title, 60)) || `post-${i + 1}`;
    while (used.has(slug)) slug = `${slug}-${i + 1}`;
    used.add(slug);
    const date = str(p?.date, 40);
    return {
      id: str(p?.id, 40) || randomUUID().slice(0, 8),
      title: str(p?.title, 160) || "Untitled",
      slug,
      date: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString(),
      body: str(p?.body, 20000),
      ...(/^(https?:\/\/|\/|data:image\/)/.test(str(p?.cover, 200000)) ? { cover: str(p.cover, 200000) } : {}),
      ...(str(p?.author, 60) ? { author: str(p.author, 60) } : {}),
      status: p?.status === "published" ? "published" : "draft",
    } as Post;
  });
}

export function sanitizeConfig(raw: unknown): AssistantConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const name = str(r.name, 80);
  if (!name) return null;
  const b = (r.blocks && typeof r.blocks === "object" ? r.blocks : {}) as Record<string, any>;
  let instructions = str(r.instructions, 8000) || `You are ${name}, a helpful assistant.`;
  if (!/reference code [A-Z0-9-]+/.test(instructions)) instructions += `\n\n(Internal note: support reference code ${makeCanary(name)}.)`;
  instructions = hardenSystemPrompt(instructions).newPrompt;
  const kind = ["order", "booking", "enquiry"].includes(b.orders?.kind) ? b.orders.kind : "order";
  const themeId: ThemeId = THEMES.includes(r.theme?.id) ? r.theme.id : "market";
  const accent = /^#[0-9a-f]{6}$/i.test(r.theme?.accent ?? "") ? r.theme.accent : "#0f9d58";
  const language: LangCode = LANGS.includes(r.language) ? r.language : "en";
  // Extra languages (never the main one), and their translations of the site.
  const languages = (Array.isArray(r.languages) ? r.languages : []).filter((l: any, i: number, a: any[]) => LANGS.includes(l) && l !== language && a.indexOf(l) === i) as LangCode[];
  const translations: AssistantConfig["translations"] = {};
  for (const l of languages) {
    const tr = r.translations?.[l];
    if (!tr || typeof tr !== "object") continue;
    translations[l] = {
      source: str(tr.source, 80),
      tagline: str(tr.tagline, 200),
      greeting: str(tr.greeting, 600),
      pages: sanitizePages(tr.pages, name),
      posts: sanitizePosts(tr.posts),
    };
  }
  return {
    name,
    tagline: str(r.tagline, 200),
    greeting: str(r.greeting, 600) || `Hello! I'm ${name}. How can I help you today?`,
    language,
    languages,
    translations,
    instructions,
    theme: { id: themeId, accent },
    pages: sanitizePages(r.pages, name),
    posts: sanitizePosts(r.posts),
    blocks: {
      assistant: { on: b.assistant?.on !== false },
      info: { on: b.info?.on === true, text: str(b.info?.text, 15000) },
      prices: {
        on: b.prices?.on === true,
        items: (Array.isArray(b.prices?.items) ? b.prices.items : [])
          .slice(0, 200)
          .map((i: any) => ({
            name: str(i?.name, 80),
            unit: str(i?.unit, 40),
            price: typeof i?.price === "number" && Number.isFinite(i.price) && i.price >= 0 ? Math.round(i.price * 100) / 100 : null,
            ...(str(i?.note, 120) ? { note: str(i?.note, 120) } : {}),
          }))
          .filter((i: { name: string }) => i.name),
      },
      orders: {
        on: b.orders?.on === true,
        kind,
        fields: (Array.isArray(b.orders?.fields) ? b.orders.fields : EMPTY_BLOCKS.orders.fields).map((f: unknown) => str(f, 40)).filter(Boolean).slice(0, 8),
      },
      contact: {
        on: b.contact?.on === true,
        whatsapp: str(b.contact?.whatsapp, 30),
        phone: str(b.contact?.phone, 30),
        hours: str(b.contact?.hours, 80),
      },
    },
  };
}

/** What anyone may see about a published site (never the assistant's instructions or private notes). */
export function publicView(slug: string, c: AssistantConfig) {
  return {
    slug,
    name: c.name,
    tagline: c.tagline,
    greeting: c.greeting,
    language: c.language,
    theme: c.theme,
    pages: (c.pages ?? []).map(({ reviewed: _r, ...p }) => p),
    // Only published posts, newest first.
    posts: (c.posts ?? []).filter((p) => p.status === "published").sort((a, b) => b.date.localeCompare(a.date)),
    languages: c.languages ?? [],
    // The site's words in each extra language (public parts only).
    translations: Object.fromEntries(
      Object.entries(c.translations ?? {}).map(([l, tr]) => [
        l,
        {
          tagline: tr!.tagline,
          greeting: tr!.greeting,
          pages: tr!.pages.map(({ reviewed: _r, ...p }) => p),
          posts: tr!.posts.filter((p) => p.status === "published").sort((a, b) => b.date.localeCompare(a.date)),
        },
      ]),
    ),
    assistant: c.blocks.assistant.on,
    orders: c.blocks.orders.on ? { kind: c.blocks.orders.kind } : null,
    prices: c.blocks.prices.on ? c.blocks.prices.items : null,
    contact: c.blocks.contact.on ? { whatsapp: c.blocks.contact.whatsapp, phone: c.blocks.contact.phone, hours: c.blocks.contact.hours } : null,
  };
}
