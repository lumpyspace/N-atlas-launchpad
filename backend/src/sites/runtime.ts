/**
 * How a published assistant answers a visitor.
 *
 *   visitor's words ─▶ N-ATLAS: English reading (when they aren't English)
 *                   ─▶ assistant model: decides the reply from the owner's
 *                      building blocks only, and gathers order details
 *                   ─▶ N-ATLAS: the reply in the visitor's language
 *
 * Without the assistant model, N-ATLAS answers on its own from the same facts
 * (it can't take orders then). Prices, phone numbers and opening hours come
 * only from what the owner entered; the reply never reveals the instructions.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Brain, BrainMessage } from "../brain/brain.js";
import { speakIn, understand } from "../brain/relay.js";
import { detectLanguage, LANG_NAMES, type LangCode } from "../eval/lang.js";
import { logger } from "../logger.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import type { AssistantConfig, InboxItem } from "./types.js";

export interface Turn {
  role: "user" | "assistant";
  /** For the assistant's turns, the English it was thought in (when it was translated). */
  content: string;
}

export interface SiteAnswer {
  reply: string;
  /** The reply in English (shown on request; sent back as history). */
  english: string;
  language: LangCode;
  /** Who wrote the words shown ("N-ATLAS", or the assistant model's name). */
  voice: string;
  brain?: string;
  /** A complete order/booking from this turn (saved to the inbox for a live assistant). */
  order?: InboxItem;
  /** Fingerprint of that order, so it's saved once even if the conversation goes on. */
  orderKey?: string;
}

export const SAFE_REPLY = "Sorry, I can't help with that. Please ask me something else.";
const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;

/** A blank the owner hasn't filled in yet ("…", "____"): not a fact. */
const BLANK = /…|\.\.\.|_{3,}/;

/** What the site's pages say: the assistant knows its own website. */
export function pagesText(config: AssistantConfig): string {
  const lines: string[] = [];
  for (const p of config.pages ?? []) {
    // A draft nobody has checked may contain guesses: not a source of facts.
    if (p.reviewed === false) continue;
    const own: string[] = [];
    for (const s of p.sections) {
      if (s.type === "hero" || s.type === "text") {
        const body = [s.heading, s.text].filter((x) => x && x.trim()).join(": ");
        if (body) own.push(body);
      } else if (s.type === "faq") {
        for (const i of s.items) own.push(`Q: ${i.q} A: ${i.a}`);
      }
    }
    // Lines with blanks are drafts, not facts.
    const facts = own.filter((l) => !BLANK.test(l));
    if (facts.length) lines.push(`[${p.title}]\n${facts.join("\n")}`);
  }
  // Published blog posts are public facts too (newest first).
  const posts = (config.posts ?? []).filter((x) => x.status === "published").sort((a, b) => b.date.localeCompare(a.date));
  for (const post of posts.slice(0, 10)) {
    if (!BLANK.test(post.body)) lines.push(`[Blog post, ${post.date.slice(0, 10)}: ${post.title}]\n${post.body.slice(0, 1500)}`);
  }
  return lines.join("\n\n").slice(0, 12000);
}

/** The owner's site and plugins, as the only facts the assistant may use. */
export function factsFor(config: AssistantConfig): string {
  const b = config.blocks;
  const parts: string[] = [];
  const site = pagesText(config);
  if (site) parts.push(`THE WEBSITE'S PAGES:\n${site}`);
  if (b.info.on && b.info.text.trim()) parts.push(`MORE INFORMATION FROM THE OWNER:\n${b.info.text.trim()}`);
  if (b.prices.on && b.prices.items.length) {
    parts.push(
      "PRICE LIST (naira; quote exactly; an item without a price means: say you'll need to check with the owner):\n" +
        b.prices.items
          .map((i) => `- ${i.name}${i.unit ? ` (${i.unit})` : ""}: ${i.price == null ? "price not set" : naira(i.price)}${i.note ? ` — ${i.note}` : ""}`)
          .join("\n"),
    );
  }
  if (b.orders.on) {
    parts.push(
      `TAKING A${b.orders.kind === "order" ? "N ORDER" : ` ${b.orders.kind.toUpperCase()}`}: collect these details, one or two at a time: ${b.orders.fields.join(", ")}. ` +
        "When you have them all, read them back and ask the visitor to confirm. Only after they confirm, mark it complete and tell them the owner will contact them. " +
        "Don't take payment or promise delivery times the owner hasn't given.",
    );
  }
  if (b.contact.on && (b.contact.whatsapp || b.contact.phone)) {
    parts.push(
      `TALKING TO A PERSON: ${[b.contact.whatsapp && `WhatsApp ${b.contact.whatsapp}`, b.contact.phone && `phone ${b.contact.phone}`, b.contact.hours && `(${b.contact.hours})`]
        .filter(Boolean)
        .join(", ")}. Offer it when you can't help, or when they ask for a person.`,
    );
  }
  return parts.join("\n\n") || "The owner hasn't added any facts yet: say what you're for, and that the owner will add details soon.";
}

function brainSystem(config: AssistantConfig, visitor: LangCode): string {
  const ordersOn = config.blocks.orders.on;
  return `${config.instructions}

Use ONLY these facts. Never invent prices, stock, dates, opening hours, phone numbers or policies; if something isn't here, say so and offer what you can.
Visitors may write in Pidgin, Yoruba, Hausa or Igbo. Asked about an item, "how much" words — "nawa" (Hausa), "eélò"/"elo" (Yoruba), "ego ole"/"ole" (Igbo), "how much"/"wetin be the price" (Pidgin) — usually mean its price.

${factsFor(config)}

Answer in JSON only, exactly: {"reply": "<your reply to the visitor>", "order": ${ordersOn ? '<null, or {"fields": {"<detail>": "<value>"}, "complete": true|false} while you are taking one>' : "null"}}
Write "reply" in clear, simple English${visitor === "en" ? "" : `: N-ATLAS translates it into ${LANG_NAMES[visitor]} for the visitor`}. Keep it short (at most 4 sentences or a short list).`;
}

/** The model's JSON (it sometimes wraps it in a code fence or adds a sentence). */
export function parseReply(text: string): { reply: string; order?: { fields: Record<string, string>; complete: boolean } } {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (raw) {
    try {
      const j = JSON.parse(raw) as { reply?: unknown; order?: any };
      if (typeof j.reply === "string" && j.reply.trim()) {
        const o = j.order && typeof j.order === "object" && j.order.fields && typeof j.order.fields === "object" ? j.order : null;
        const fields = o ? Object.fromEntries(Object.entries(o.fields).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 300)])) : {};
        return { reply: j.reply.trim(), ...(o ? { order: { fields, complete: o.complete === true } } : {}) };
      }
    } catch {
      /* not JSON after all */
    }
  }
  return { reply: text.trim() };
}

/** Does the reply show the instructions (their reference code, or a long line of them)? */
export function leaks(config: AssistantConfig, reply: string): boolean {
  const code = config.instructions.match(/reference code ([A-Z0-9-]+)/)?.[1];
  if (code && reply.includes(code)) return true;
  return config.instructions
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 60)
    .some((l) => reply.includes(l));
}

/** The visitor's language: what they wrote in, else the assistant's own. */
export function visitorLanguage(words: string, fallback: LangCode): LangCode {
  const g = detectLanguage(words);
  if (g.confidence === 0) return fallback;
  // Sites speak N-ATLAS's four official languages; Pidgin is understood, answered in English.
  return g.lang === "pid" ? "en" : g.lang;
}

const fingerprint = (fields: Record<string, string>) =>
  createHash("sha256").update(JSON.stringify(Object.entries(fields).sort())).digest("hex").slice(0, 16);

export async function answerVisitor(
  config: AssistantConfig,
  history: Turn[],
  deps: { brain?: Brain; natlas: NAtlasProvider; signal?: AbortSignal },
  /** Orders already saved in this conversation (their fingerprints). */
  sent: string[] = [],
  /** The language the visitor picked on the site, for when their words don't say. */
  chosen?: LangCode,
): Promise<SiteAnswer> {
  const { brain, natlas, signal } = deps;
  const latest = history[history.length - 1]?.content ?? "";
  // Judged on their last few messages: one short line ("08031234567, yes") says little.
  const theirWords = history.filter((t) => t.role === "user").slice(-3).map((t) => t.content).join("\n");
  const language = visitorLanguage(theirWords, chosen ?? config.language);

  if (brain?.available()) {
    try {
      const reading = language === "en" ? "" : await understand(natlas, latest, signal).catch(() => "");
      const turns: BrainMessage[] = history.slice(-10).map((t) => ({ role: t.role, content: t.content }));
      if (reading) {
        turns[turns.length - 1] = { role: "user", content: `${latest}\n\n(N-ATLAS read this as: "${reading}". If they disagree, trust the words as written.)` };
      }
      const r = await brain.chat([{ role: "system", content: brainSystem(config, language) }, ...turns], { maxTokens: 700, temperature: 0.3, signal });
      const parsed = parseReply(r.text);
      let english = leaks(config, parsed.reply) ? SAFE_REPLY : parsed.reply;
      let order: InboxItem | undefined;
      let orderKey: string | undefined;
      if (config.blocks.orders.on && parsed.order?.complete && Object.keys(parsed.order.fields).length) {
        orderKey = fingerprint(parsed.order.fields);
        if (!sent.includes(orderKey)) {
          order = { id: randomUUID(), kind: config.blocks.orders.kind, fields: parsed.order.fields, language, at: new Date().toISOString() };
        }
      }
      if (english === SAFE_REPLY) order = undefined;
      const said = await speakIn({ brain, natlas, language, english, brainName: r.provider, keep: [config.name], signal });
      return { reply: said.text, english, language, voice: said.voice, brain: r.provider, order, orderKey };
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.error("site: assistant model failed; N-ATLAS answers alone", { reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // N-ATLAS on its own: the same facts, answered directly in the visitor's language.
  const transcript = history.slice(-8).map((t) => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.content}`).join("\n");
  const r = await natlas.generate(`${transcript}\nAssistant:`, {
    system: `${config.instructions}\n\nUse ONLY these facts; never invent prices or numbers:\n${factsFor(config)}\n\nReply in ${LANG_NAMES[language]}, in at most 4 sentences.`,
    maxTokens: 300,
    temperature: 0.2,
  });
  const text = leaks(config, r.text) ? SAFE_REPLY : r.text.trim();
  return { reply: text, english: text, language, voice: "N-ATLAS" };
}
