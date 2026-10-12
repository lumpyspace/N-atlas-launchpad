/**
 * Set up an assistant from the project's plan: the assistant model picks the
 * building blocks and drafts the words; the owner fills in the facts (prices
 * are never invented — items come with no price until the owner sets one).
 * Without the assistant model, sensible defaults from the plan are used.
 */

import type { Brain } from "../brain/brain.js";
import { speakIn, translatePieces } from "../brain/relay.js";
import { factsFor as planFacts } from "../blueprint/narrate.js";
import type { Blueprint } from "../blueprint/types.js";
import type { LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { EMPTY_BLOCKS, type AssistantConfig, type Blocks } from "./types.js";

const KINDS = ["order", "booking", "enquiry"] as const;

function defaults(bp: Blueprint, knowledge: string): { tagline: string; greeting: string; blocks: Blocks } {
  const wantsPrices = /price|cost|menu|rate|tariff|fee/i.test([bp.purpose, ...bp.primaryTasks, ...(bp.buildPlan?.dataSources ?? []).map((d) => d.name)].join(" "));
  return {
    tagline: bp.purpose.charAt(0).toUpperCase() + bp.purpose.slice(1).replace(/[.!?]*$/, "."),
    greeting: `Hello! I'm ${bp.name}. How can I help you today?`,
    blocks: {
      ...EMPTY_BLOCKS,
      info: { on: true, text: knowledge },
      prices: { on: wantsPrices, items: [] },
    },
  };
}

export function draftRequest(bp: Blueprint): string {
  return `Facts about the assistant:
${planFacts(bp)}

Set up this assistant from building blocks. Reply in JSON only:
{"tagline": "<one short sentence for its page>",
 "greeting": "<its first message to a visitor: friendly, one or two sentences, says what it can help with>",
 "info": "<a starting information sheet: short lines with the headings this business needs (e.g. Opening hours, Address, Delivery) and … where the owner must fill in the facts — never invent facts>",
 "prices": {"on": true|false, "items": [{"name": "<item>", "unit": "<unit>"}]},
 "orders": {"on": true|false, "kind": "order"|"booking"|"enquiry", "fields": ["<detail to collect>", …]},
 "contact": {"on": true|false}}
Turn "prices" on only if visitors will ask what things cost; list up to 8 likely items with NO prices.
Turn "orders" on only if visitors would order, book or leave an enquiry; fields: 3 to 6 short names, always including name and phone number.
Turn "contact" on if a visitor may need a person.`;
}

/** The draft config (in English, except the greeting, which is in the assistant's language). */
export async function draftConfig(
  bp: Blueprint,
  language: LangCode,
  deps: { brain?: Brain; natlas: NAtlasProvider },
  knowledge = "",
): Promise<{ config: AssistantConfig; by: string }> {
  const base = defaults(bp, knowledge);
  let draft = base;
  let by = "Launchpad";
  if (deps.brain?.available()) {
    try {
      const r = await deps.brain.chat(
        [
          { role: "system", content: "You set up AI assistants for Nigerian businesses and organisations, from tested building blocks. Be practical and specific to this business." },
          { role: "user", content: draftRequest(bp) },
        ],
        { maxTokens: 900, temperature: 0.3 },
      );
      const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, any>;
      const items = Array.isArray(j.prices?.items) ? j.prices.items : [];
      draft = {
        tagline: typeof j.tagline === "string" && j.tagline.trim() ? j.tagline.trim() : base.tagline,
        greeting: typeof j.greeting === "string" && j.greeting.trim() ? j.greeting.trim() : base.greeting,
        blocks: {
          info: { on: true, text: [knowledge.trim(), typeof j.info === "string" ? j.info.trim() : ""].filter(Boolean).join("\n\n") },
          prices: {
            on: j.prices?.on === true,
            items: items
              .filter((i: any) => typeof i?.name === "string" && i.name.trim())
              .slice(0, 12)
              .map((i: any) => ({ name: String(i.name).slice(0, 80), unit: typeof i.unit === "string" ? i.unit.slice(0, 40) : "", price: null })),
          },
          orders: {
            on: j.orders?.on === true,
            kind: KINDS.includes(j.orders?.kind) ? j.orders.kind : "order",
            fields: (Array.isArray(j.orders?.fields) ? j.orders.fields : EMPTY_BLOCKS.orders.fields)
              .filter((f: unknown) => typeof f === "string" && f.trim())
              .slice(0, 8)
              .map((f: string) => f.slice(0, 40)),
          },
          contact: { ...EMPTY_BLOCKS.contact, on: j.contact?.on === true },
        },
      };
      by = r.provider;
    } catch (err) {
      logger.error("site draft: assistant model failed; using defaults", { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // The greeting in the assistant's language.
  let greeting = draft.greeting;
  if (language !== "en") {
    if (deps.brain?.available()) {
      greeting = (await speakIn({ brain: deps.brain, natlas: deps.natlas, language, english: greeting, brainName: by, keep: [bp.name] }).catch(() => ({ text: greeting }))).text;
    } else {
      greeting = (await translatePieces(deps.natlas, greeting, language, undefined, undefined, [bp.name]).catch(() => null))?.text ?? greeting;
    }
  }

  return {
    by,
    config: { name: bp.name, tagline: draft.tagline, greeting, language, instructions: bp.systemPrompt, blocks: draft.blocks },
  };
}
