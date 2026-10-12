/**
 * "Write with Groq": a draft blog post from a topic, using only what the site
 * already says — facts it doesn't have are left as … for the owner. N-ATLAS
 * puts it into the site's language. Always a draft: the owner publishes it.
 */

import type { Brain } from "../brain/brain.js";
import { speakIn } from "../brain/relay.js";
import type { LangCode } from "../eval/lang.js";
import type { NAtlasProvider } from "../providers/NAtlasProvider.js";
import { factsFor } from "./runtime.js";
import type { AssistantConfig } from "./types.js";

export async function writePost(
  config: AssistantConfig,
  idea: string,
  deps: { brain: Brain; natlas: NAtlasProvider },
): Promise<{ title: string; body: string; by: string }> {
  const r = await deps.brain.chat(
    [
      {
        role: "system",
        content:
          "You write short, warm blog posts for small Nigerian businesses' websites. Plain words, short paragraphs, no headings, no hashtags, no emoji. " +
          "Never invent facts — prices, dates, addresses, phone numbers, offers, awards, statistics: write … where the owner must add one.",
      },
      {
        role: "user",
        content: `The business: ${config.name} — ${config.tagline}\n\nWhat its site says:\n${factsFor(config)}\n\nWrite a blog post about: ${idea}\n\nReply in JSON only: {"title": "<short title>", "body": "<3 to 5 short paragraphs separated by blank lines, under 300 words>"}`,
      },
    ],
    { maxTokens: 1200, temperature: 0.6 },
  );
  const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { title?: string; body?: string };
  if (!j.title || !j.body) throw new Error("The assistant model didn't return a post.");
  const language = config.language as LangCode;
  const say = (english: string) => speakIn({ brain: deps.brain, natlas: deps.natlas, language, english, brainName: r.provider, keep: [config.name] }).then((x) => x.text);
  const [title, body] = language === "en" ? [j.title, j.body] : await Promise.all([say(j.title), say(j.body)]);
  return { title: title.trim(), body: body.trim(), by: r.provider };
}
