/**
 * A site, WordPress-style: pages built from sections, a theme, and plugins —
 * the N-ATLAS assistant among them — plus what visitors left in its inbox.
 * Launchpad hosts it at /a/<slug>.
 */

import type { LangCode } from "../eval/lang.js";

export interface PriceItem {
  name: string;
  /** "bag (50 kg)", "per kg", "plate"… */
  unit: string;
  /** In naira; null until the owner fills it in (prices are never invented). */
  price: number | null;
  note?: string;
}

/**
 * The plugins (WordPress-style): each adds a feature to the site, switched on
 * or off. The assistant answers from the site's pages plus these.
 */
export interface Blocks {
  /** The N-ATLAS assistant: a chat bubble on every page. */
  assistant: { on: boolean };
  /** Extra notes only the assistant knows (not shown on the site): policies, documents… */
  info: { on: boolean; text: string };
  prices: { on: boolean; items: PriceItem[] };
  /** Collect details in conversation; complete ones land in the owner's inbox. */
  orders: { on: boolean; kind: "order" | "booking" | "enquiry"; fields: string[] };
  /** Hand over to a person. */
  contact: { on: boolean; whatsapp: string; phone: string; hours: string };
}

/** A section of a page — the building blocks of the site (like WordPress blocks). */
export type Section =
  | { type: "hero"; heading: string; text: string; button: "chat" | "order" | "whatsapp" | "none" }
  | { type: "text"; heading: string; text: string }
  | { type: "faq"; heading: string; items: { q: string; a: string }[] }
  /** The price list plugin's table. */
  | { type: "prices"; heading: string }
  /** The contact plugin's details (WhatsApp, phone, hours). */
  | { type: "contact"; heading: string };

export interface Page {
  id: string;
  title: string;
  /** "" for the home page; otherwise its address: /a/<site>/<slug>. */
  slug: string;
  inMenu: boolean;
  sections: Section[];
  /** The owner has checked it. A page Groq drafted isn't a source of facts for the assistant until then. */
  reviewed?: boolean;
}

export const THEMES = ["market", "clean", "warm", "night"] as const;
export type ThemeId = (typeof THEMES)[number];

export interface Theme {
  id: ThemeId;
  /** The accent colour, #rrggbb. */
  accent: string;
}

export interface AssistantConfig {
  /** Site title. */
  name: string;
  /** One line under the name on the public page. */
  tagline: string;
  /** The first message visitors see, in the assistant's language. */
  greeting: string;
  /** The assistant's main language (it also answers visitors in theirs). */
  language: LangCode;
  /** The system prompt: who it is and how it behaves (hardened, with its reference code). */
  instructions: string;
  /** Plugins. */
  blocks: Blocks;
  theme: Theme;
  /** The site's pages, in menu order; the first is the home page. */
  pages: Page[];
}

export interface Site {
  slug: string;
  config: AssistantConfig;
  /** sha256 of the owner's edit key (the key itself is only shown to the owner). */
  ownerKeyHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxItem {
  id: string;
  kind: Blocks["orders"]["kind"];
  fields: Record<string, string>;
  /** The visitor's language, so the owner knows how to reply. */
  language: LangCode;
  at: string;
}

export const EMPTY_BLOCKS: Blocks = {
  assistant: { on: true },
  info: { on: false, text: "" },
  prices: { on: false, items: [] },
  orders: { on: false, kind: "order", fields: ["name", "phone number"] },
  contact: { on: false, whatsapp: "", phone: "", hours: "" },
};
