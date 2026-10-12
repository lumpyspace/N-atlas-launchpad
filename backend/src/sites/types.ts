/**
 * A published assistant ("site"): what it says, which building blocks it uses,
 * and what visitors have left in its inbox. Launchpad hosts it at /a/<slug>.
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

export interface Blocks {
  /** Free text the assistant answers from: FAQ, opening hours, address, policies, documents. */
  info: { on: boolean; text: string };
  prices: { on: boolean; items: PriceItem[] };
  /** Collect details in conversation; complete ones land in the owner's inbox. */
  orders: { on: boolean; kind: "order" | "booking" | "enquiry"; fields: string[] };
  /** Hand over to a person. */
  contact: { on: boolean; whatsapp: string; phone: string; hours: string };
}

export interface AssistantConfig {
  name: string;
  /** One line under the name on the public page. */
  tagline: string;
  /** The first message visitors see, in the assistant's language. */
  greeting: string;
  /** The assistant's main language (it also answers visitors in theirs). */
  language: LangCode;
  /** The system prompt: who it is and how it behaves (hardened, with its reference code). */
  instructions: string;
  blocks: Blocks;
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
  info: { on: true, text: "" },
  prices: { on: false, items: [] },
  orders: { on: false, kind: "order", fields: ["name", "phone number"] },
  contact: { on: false, whatsapp: "", phone: "", hours: "" },
};
