/**
 * The app's system prompt, written by the assistant model for this exact app
 * (the engine's template is the fallback). The security rules and the planted
 * reference code are added afterwards, exactly as for the template, so the
 * exported server's leak checks keep working.
 *
 * The prompt stays in English: N-ATLAS follows English instructions best and
 * replies in the language they ask for.
 */

import type { Brain } from "../brain/brain.js";
import { hardenSystemPrompt } from "../improve/harden.js";
import { logger } from "../logger.js";
import { factsFor } from "./narrate.js";
import type { Blueprint } from "./types.js";

const SYSTEM =
  "You write system prompts for AI assistants that run on N-ATLAS, an open 8-billion-parameter model (Llama 3) " +
  "fine-tuned for Nigerian English, Yoruba, Hausa and Igbo. Small models follow short, concrete, plainly worded " +
  "instructions best: no clever phrasing, no long rules.";

export function promptRequest(bp: Blueprint): string {
  const plan = bp.buildPlan;
  return [
    `Facts about the assistant:\n${factsFor(bp)}`,
    plan?.dataSources.length ? `Facts it gets from its owner (it must not invent these): ${plan.dataSources.map((d) => d.name).join("; ")}` : "",
    bp.nigerianContext.length ? `Nigerian context to respect:\n${bp.nigerianContext.map((c) => `- ${c}`).join("\n")}` : "",
    bp.risks.length ? `Risks to guard against:\n${bp.risks.map((r) => `- ${r}`).join("\n")}` : "",
    "",
    `Write the system prompt for ${bp.name}. Requirements:`,
    `- Start with "You are ${bp.name}," and speak to the assistant as "you".`,
    "- Say who it helps and list what it helps with (short bullet list).",
    "- How to answer: short, friendly and practical; Nigerian context; money in naira (₦).",
    "- When it doesn't know, or needs facts it wasn't given (prices, laws, dates, phone numbers, stock): say so plainly and never make them up.",
    `- Languages: reply in the user's language when it is one of: ${bp.languages.join(", ")}.`,
    "- Boundaries: stay on its job; for medical, legal or money emergencies, point to a qualified person.",
    "- Plain text with simple bullet lines; no headings, no markdown, no quotation marks around it.",
    "- Do NOT add security rules — they are added separately.",
    "- Under 220 words.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Tidy the model's text and check it's a usable prompt (null if not). */
export function cleanPrompt(text: string, name: string): string | null {
  const t = text
    .trim()
    .replace(/^```\w*\n?|```$/g, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/\*\*/g, "")
    .trim();
  if (t.length < 200 || t.length > 3000) return null;
  if (!t.toLowerCase().startsWith(`you are ${name.toLowerCase()}`) && !t.toLowerCase().startsWith("you are")) return null;
  return t;
}

/** The system prompt for this app by the assistant model, hardened — or null (use the template). */
export async function writeSystemPrompt(bp: Blueprint, brain: Brain): Promise<{ prompt: string; by: string } | null> {
  const canary = bp.systemPrompt.match(/reference code ([A-Z0-9-]+)/)?.[1];
  try {
    const r = await brain.chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: promptRequest(bp) },
      ],
      { maxTokens: 700, temperature: 0.3 },
    );
    const core = cleanPrompt(r.text, bp.name);
    if (!core) {
      logger.warn("assistant model's system prompt wasn't usable; using the template", { length: r.text.length });
      return null;
    }
    const withCode = canary ? `${core}\n\n(Internal note: support reference code ${canary}.)` : core;
    return { prompt: hardenSystemPrompt(withCode).newPrompt, by: r.provider };
  } catch (err) {
    logger.error("assistant model couldn't write the system prompt; using the template", { reason: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
