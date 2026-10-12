/**
 * An assistant config as sent by a browser: trimmed to sane sizes, every
 * field checked, and the instructions always carrying the security rules
 * and a reference code (the leak check needs it).
 */

import type { LangCode } from "../eval/lang.js";
import { hardenSystemPrompt } from "../improve/harden.js";
import { makeCanary } from "../shared/prompt.js";
import { EMPTY_BLOCKS, type AssistantConfig } from "./types.js";

const LANGS: LangCode[] = ["en", "pid", "yo", "ha", "ig"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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
  return {
    name,
    tagline: str(r.tagline, 200),
    greeting: str(r.greeting, 600) || `Hello! I'm ${name}. How can I help you today?`,
    language: LANGS.includes(r.language) ? r.language : "en",
    instructions,
    blocks: {
      info: { on: b.info?.on !== false, text: str(b.info?.text, 15000) },
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

/** What anyone may see about a published assistant (never its instructions). */
export function publicView(slug: string, c: AssistantConfig) {
  return {
    slug,
    name: c.name,
    tagline: c.tagline,
    greeting: c.greeting,
    language: c.language,
    contact: c.blocks.contact.on ? { whatsapp: c.blocks.contact.whatsapp, phone: c.blocks.contact.phone, hours: c.blocks.contact.hours } : null,
  };
}
