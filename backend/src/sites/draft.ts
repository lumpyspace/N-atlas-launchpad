/**
 * Create the site from the project's plan: the assistant model writes the
 * pages (Home, About, Prices, Contact…), picks a theme and the plugins, and
 * N-ATLAS puts the words into the site's language. Facts the owner must
 * supply are left as … (prices are never invented — items come without one).
 * Without the assistant model, a simple site from the plan is used.
 */

import { randomUUID } from "node:crypto";
import type { Brain } from "../brain/brain.js";
import { speakIn, translatePieces } from "../brain/relay.js";
import { factsFor as planFacts } from "../blueprint/narrate.js";
import type { Blueprint } from "../blueprint/types.js";
import type { LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { sanitizeConfig } from "./sanitize.js";
import { EMPTY_BLOCKS, THEMES, type AssistantConfig, type Page, type Section } from "./types.js";

const ACCENTS: Record<string, string> = { market: "#0f9d58", clean: "#2563eb", warm: "#ea580c", night: "#22c55e" };

function defaultSite(bp: Blueprint, knowledge: string) {
  const wantsPrices = /price|cost|menu|rate|tariff|fee/i.test([bp.purpose, ...bp.primaryTasks, ...(bp.buildPlan?.dataSources ?? []).map((d) => d.name)].join(" "));
  const purpose = bp.purpose.charAt(0).toUpperCase() + bp.purpose.slice(1).replace(/[.!?]*$/, ".");
  const pages: Page[] = [
    {
      id: "home",
      title: "Home",
      slug: "",
      inMenu: true,
      sections: [
        { type: "hero", heading: bp.name, text: purpose, button: "chat" },
        { type: "text", heading: "What we do", text: bp.primaryTasks.map((t) => `• ${t}`).join("\n") },
      ],
    },
    ...(wantsPrices ? [{ id: "prices", title: "Prices", slug: "prices", inMenu: true, sections: [{ type: "prices", heading: "Our prices" } as Section] }] : []),
    { id: "contact", title: "Contact", slug: "contact", inMenu: true, sections: [{ type: "text", heading: "Find us", text: "Address: …\nOpening hours: …" }, { type: "contact", heading: "Talk to us" }] },
  ];
  return {
    tagline: purpose,
    greeting: `Hello! I'm ${bp.name}. How can I help you today?`,
    theme: { id: "market" as const, accent: ACCENTS.market },
    pages,
    blocks: {
      ...EMPTY_BLOCKS,
      info: { on: !!knowledge.trim(), text: knowledge },
      prices: { on: wantsPrices, items: [] },
      contact: { ...EMPTY_BLOCKS.contact, on: true },
    },
  };
}

export function draftRequest(bp: Blueprint): string {
  return `Facts about the business and its assistant:
${planFacts(bp)}

Create a small website for it, with an AI assistant on every page. Reply in JSON only:
{"title": "<the site's name: the business's own name if the facts give one, else a short, plain name for it>",
 "tagline": "<one short sentence>",
 "greeting": "<the assistant's first message: friendly, one or two sentences; it can ONLY answer questions about this business, quote the price list, take orders/bookings/enquiries and pass people to a staff member — never mention tracking, returns, refunds, payments or accounts>",
 "theme": "market" | "clean" | "warm" | "night",
 "pages": [
   {"title": "Home", "sections": [{"type": "hero", "heading": "<…>", "text": "<…>", "button": "chat" | "order" | "whatsapp"}, {"type": "text", "heading": "<…>", "text": "<…>"}]},
   {"title": "<e.g. Prices, Menu, Services, About, FAQ, Contact>", "sections": [<sections>]}
 ],
 "plugins": {"prices": {"on": true|false, "items": [{"name": "<item>", "unit": "<unit>"}]},
             "orders": {"on": true|false, "kind": "order" | "booking" | "enquiry", "fields": ["<detail to collect>", …]},
             "contact": {"on": true|false}}}
Section types: "hero" (heading, text, button), "text" (heading, text), "faq" (heading, items: [{"q","a"}]), "prices" (heading — shows the price list), "contact" (heading — shows WhatsApp/phone/hours).
Rules:
- 3 to 5 pages; the first is Home. Include a "prices" section only if the prices plugin is on, and a "contact" section only if the contact plugin is on.
- Write warm, plain, specific text for this business. Never invent facts or promises: prices, addresses, phone numbers, opening hours, payment methods, delivery areas, delivery fees or times, quality claims ("fresh daily", "fastest"), years in business, awards. Write … where the owner must fill one in.
- FAQ: questions customers really ask; answers say … for anything the owner must supply (e.g. "We accept …").
- Prices plugin: up to 8 likely items with NO prices. Orders: 3 to 6 short fields, always including name and phone number.`;
}

/** Run `fn` over `items`, a few at a time (the N-ATLAS server serves several at once). */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Put every visible word of the site into its language (names kept as they are). */
async function translateSite(site: ReturnType<typeof defaultSite>, name: string, language: LangCode, deps: { brain?: Brain; natlas: NAtlasProvider }, by: string) {
  const say = async (english: string): Promise<string> => {
    if (!english.trim()) return english;
    try {
      if (deps.brain?.available()) return (await speakIn({ brain: deps.brain, natlas: deps.natlas, language, english, brainName: by, keep: [name] })).text;
      return (await translatePieces(deps.natlas, english, language, undefined, undefined, [name]))?.text ?? english;
    } catch {
      return english;
    }
  };
  // Collect every string, translate them a few at a time, and put them back.
  const slots: { get: () => string; set: (v: string) => void }[] = [];
  const add = (obj: any, key: string) => slots.push({ get: () => obj[key], set: (v) => (obj[key] = v) });
  add(site, "tagline");
  add(site, "greeting");
  for (const p of site.pages) {
    add(p, "title");
    for (const s of p.sections as any[]) {
      if ("heading" in s) add(s, "heading");
      if ("text" in s) add(s, "text");
      if (s.type === "faq") for (const i of s.items) (add(i, "q"), add(i, "a"));
    }
  }
  const done = await pool(slots, 6, (s) => say(s.get()));
  done.forEach((v, i) => slots[i].set(v));
}

/** The draft site (its words in the site's language). */
export async function draftConfig(
  bp: Blueprint,
  language: LangCode,
  deps: { brain?: Brain; natlas: NAtlasProvider },
  knowledge = "",
): Promise<{ config: AssistantConfig; by: string }> {
  let site = defaultSite(bp, knowledge);
  let siteName = bp.name;
  let by = "Launchpad";
  if (deps.brain?.available()) {
    try {
      const r = await deps.brain.chat(
        [
          { role: "system", content: "You create small, honest websites with an AI assistant for Nigerian businesses and organisations, from tested building blocks." },
          { role: "user", content: draftRequest(bp) },
        ],
        { maxTokens: 2500, temperature: 0.4 },
      );
      const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, any>;
      const theme = THEMES.includes(j.theme) ? j.theme : "market";
      const items = Array.isArray(j.plugins?.prices?.items) ? j.plugins.prices.items : [];
      site = {
        tagline: typeof j.tagline === "string" && j.tagline.trim() ? j.tagline.trim() : site.tagline,
        greeting: typeof j.greeting === "string" && j.greeting.trim() ? j.greeting.trim() : site.greeting,
        theme: { id: theme, accent: ACCENTS[theme] },
        pages: Array.isArray(j.pages) && j.pages.length ? (j.pages as Page[]).map((p) => ({ ...p, id: randomUUID().slice(0, 8), inMenu: true, reviewed: false })) : site.pages,
        blocks: {
          ...EMPTY_BLOCKS,
          info: { on: !!knowledge.trim(), text: knowledge },
          prices: {
            on: j.plugins?.prices?.on === true,
            items: items.filter((i: any) => typeof i?.name === "string" && i.name.trim()).slice(0, 12).map((i: any) => ({ name: String(i.name), unit: typeof i.unit === "string" ? i.unit : "", price: null })),
          },
          orders: {
            on: j.plugins?.orders?.on === true,
            kind: ["order", "booking", "enquiry"].includes(j.plugins?.orders?.kind) ? j.plugins.orders.kind : "order",
            fields: Array.isArray(j.plugins?.orders?.fields) ? j.plugins.orders.fields.filter((f: unknown) => typeof f === "string").slice(0, 8) : EMPTY_BLOCKS.orders.fields,
          },
          contact: { ...EMPTY_BLOCKS.contact, on: j.plugins?.contact?.on !== false },
        },
      };
      if (typeof j.title === "string" && j.title.trim()) siteName = j.title.trim().slice(0, 80);
      by = r.provider;
    } catch (err) {
      logger.error("site draft: assistant model failed; using a simple site", { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (language !== "en") await translateSite(site, siteName, language, deps, by);

  // Through the same checks as anything a browser sends.
  // The assistant is the site's: it introduces itself by the site's name.
  const instructions = siteName === bp.name ? bp.systemPrompt : bp.systemPrompt.split(bp.name).join(siteName);
  const config = sanitizeConfig({ name: siteName, language, instructions, ...site })!;
  return { by, config };
}
