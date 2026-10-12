/**
 * The site in another language: every word visitors read — tagline, greeting,
 * page titles and sections, FAQ, posts — translated, ids and addresses kept.
 * Into Pidgin, Yoruba, Hausa or Igbo, N-ATLAS translates (the assistant model
 * helps with lines it can't keep exact); into English, the assistant model
 * does it (N-ATLAS when there's none).
 */

import type { Brain } from "../brain/brain.js";
import { speakIn, translatePieces } from "../brain/relay.js";
import { detectLanguage, LANG_NAMES, type LangCode } from "../eval/lang.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import type { AssistantConfig, SiteTranslation } from "./types.js";

/** Run `fn` over `items`, a few at a time. */
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

export async function translateSiteTo(
  config: AssistantConfig,
  to: LangCode,
  deps: { brain?: Brain; natlas: NAtlasProvider },
): Promise<Omit<SiteTranslation, "source">> {
  const keep = [config.name];
  const say = async (text: string, label = false): Promise<string> => {
    if (!text.trim()) return text;
    try {
      // A menu item or heading of a few words has no context to go on (N-ATLAS turned
      // "Contact" into "emergency numbers"): the assistant model translates labels,
      // told what they are.
      if (label && to !== "en" && deps.brain?.available() && text.trim().split(/\s+/).length <= 4) {
        const r = await deps.brain.chat(
          [
            {
              role: "system",
              content: `Translate this label from a small business's website (a menu item or a heading) into natural, everyday ${LANG_NAMES[to]}, as a native speaker would write it on a website. Keep names (${keep.join(", ")}) as they are. Reply with only the translation.`,
            },
            { role: "user", content: text },
          ],
          { maxTokens: 60, temperature: 0.2 },
        );
        const v = r.text.trim().replace(/^["“']|["”']$/g, "");
        if (v && v.length < text.length * 4 + 20) return v;
      }
      if (to === "en") {
        if (detectLanguage(text).lang === "en") return text;
        if (deps.brain?.available()) {
          const r = await deps.brain.chat(
            [
              { role: "system", content: `Translate into clear, everyday English. Keep names (${keep.join(", ")}), numbers, prices and … exactly as they are. Reply with only the translation.` },
              { role: "user", content: text },
            ],
            { maxTokens: Math.min(2000, Math.ceil(text.length / 2) + 100) },
          );
          return r.text.trim();
        }
        const r = await deps.natlas.generate(`Translate into English:\n${text}`, { system: "Translate into English. Reply with only the translation.", maxTokens: 600, temperature: 0.1 });
        return r.text.trim() || text;
      }
      if (deps.brain?.available()) return (await speakIn({ brain: deps.brain, natlas: deps.natlas, language: to, english: text, brainName: "", keep })).text;
      return (await translatePieces(deps.natlas, text, to, undefined, undefined, keep))?.text ?? text;
    } catch {
      return text;
    }
  };

  // A deep copy whose strings are swapped for their translations.
  const out: Omit<SiteTranslation, "source"> = JSON.parse(
    JSON.stringify({ tagline: config.tagline, greeting: config.greeting, pages: config.pages, posts: config.posts ?? [] }),
  );
  const slots: { get: () => string; set: (v: string) => void; label: boolean }[] = [];
  const add = (obj: any, key: string, label = false) => slots.push({ get: () => obj[key], set: (v) => (obj[key] = v), label });
  add(out, "tagline");
  add(out, "greeting");
  for (const p of out.pages) {
    add(p, "title", true);
    for (const s of p.sections as any[]) {
      if ("heading" in s) add(s, "heading", true);
      if ("text" in s) add(s, "text");
      if (s.type === "faq") for (const i of s.items) (add(i, "q"), add(i, "a"));
    }
  }
  for (const post of out.posts) (add(post, "title"), add(post, "body"));
  const done = await pool(slots, 6, (s) => say(s.get(), s.label));
  done.forEach((v, i) => slots[i].set(v));
  return out;
}
