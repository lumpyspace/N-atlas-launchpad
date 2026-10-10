/**
 * Prompt doctor — N-ATLAS-specific checks for a system prompt, plus an
 * estimate of how much of the model's context window an exchange uses.
 *
 * Deterministic rules, so results are instant and testable. Each finding says
 * why it matters for N-ATLAS and, where possible, offers a one-line fix the UI
 * can append with one click.
 */

import { NATLAS_FACTS } from "../blueprint/buildPlan.js";
import { extractCanary, isHardened } from "../shared/prompt.js";

export type Severity = "fix" | "warn" | "info" | "good";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** A line the UI can append to the prompt with one click. */
  fix?: { label: string; line: string };
  /** A Launchpad step that resolves this (e.g. run the security tests). */
  action?: "secure";
}

export interface DoctorInput {
  systemPrompt: string;
  /** "Your data" that will be added to the prompt. */
  data?: string;
  /** Languages the app should speak (from the blueprint). */
  languages?: string[];
  /** Whether the app's answers depend on facts it is given. */
  needsKnowledge?: boolean;
  /** Reply budget in tokens (the max_tokens setting). */
  maxTokens?: number;
}

export interface Budget {
  /** All values are estimates in tokens. */
  systemPrompt: number;
  data: number;
  message: number;
  reply: number;
  total: number;
  limit: number;
  /** total / limit, 0..1+ */
  share: number;
}

export interface DoctorResult {
  findings: Finding[];
  budget: Budget;
  words: number;
}

/**
 * Rough token count for Llama-3's tokenizer: about 4 characters per token for
 * English, but accented letters (Yoruba, Igbo, Hausa hooked letters) split
 * into more tokens. Labelled as an estimate everywhere it's shown.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other / 1.5);
}

/** Typical user message, for the budget. */
const TYPICAL_MESSAGE_TOKENS = 60;
/** Same wording the runner and starter server use to add facts. */
const FACTS_HEADER = "Answer only from these facts. If they don't cover the question, say so:\n";

const HAS_LANGUAGE_RULE = /\b(respond|reply|answer|write|speak)\b[^.\n]{0,40}\b(in|using)\b[^.\n]{0,40}\b(language|english|pidgin|yoruba|hausa|igbo)\b|user'?s language|same language/i;
const HAS_SCOPE_RULE = /\bonly (help|answer|discuss|talk)\b|out of scope|off[- ]topic|stay on topic|politely (decline|refuse)|\bdecline\b|\brefuse\b|do not (help|answer|discuss)/i;
const HAS_UNCERTAINTY_RULE = /don'?t know|do not know|not sure|unsure|uncertain|verify|say so|instead of guessing|do not guess|don'?t guess/i;
const HAS_LENGTH_RULE = /\b(short|concise|brief)\b|\b\d+\s*(–|-|to)?\s*\d*\s*sentences?\b|bullet points?|keep (it|replies|answers)/i;

export function diagnose(input: DoctorInput): DoctorResult {
  const p = input.systemPrompt ?? "";
  const words = (p.match(/\S+/g) ?? []).length;
  const langs = (input.languages ?? []).filter(Boolean);
  const findings: Finding[] = [];

  // 1. Language — N-ATLAS drifts between languages unless told.
  if (!HAS_LANGUAGE_RULE.test(p)) {
    const list = langs.length ? langs.join(", ") : "Nigerian English, Pidgin, Yoruba, Hausa or Igbo";
    findings.push({
      id: "language-rule",
      severity: "fix",
      title: "No rule about which language to reply in",
      detail:
        "N-ATLAS sometimes switches language mid-conversation — in testing, a Pidgin question got a Yoruba answer. Tell it explicitly to reply in the user's language.",
      fix: { label: "Add language rule", line: `- Always reply in the same language the user writes in (${list}).` },
    });
  } else {
    findings.push({ id: "language-rule", severity: "good", title: "Says which language to reply in", detail: "Keeps replies in the user's language." });
  }

  // 2. Scope — an 8B model will happily answer anything.
  if (!HAS_SCOPE_RULE.test(p)) {
    findings.push({
      id: "scope-rule",
      severity: "warn",
      title: "No limits on what it should help with",
      detail: "Without a scope rule the app will answer off-topic or unsafe requests. Say what's in scope and how to decline the rest.",
      fix: {
        label: "Add scope rule",
        line: "- Only help with the tasks above. Politely decline anything else and say what you can help with.",
      },
    });
  } else {
    findings.push({ id: "scope-rule", severity: "good", title: "Sets a clear scope", detail: "Tells the model what to decline." });
  }

  // 3. Uncertainty — the most important rule when answers depend on facts.
  if (!HAS_UNCERTAINTY_RULE.test(p)) {
    findings.push({
      id: "uncertainty-rule",
      severity: input.needsKnowledge ? "fix" : "warn",
      title: "Doesn't say what to do when it isn't sure",
      detail: input.needsKnowledge
        ? "This app answers from facts (prices, notes, laws…). Without this rule N-ATLAS will guess confidently when the facts don't cover a question."
        : "N-ATLAS can state wrong facts confidently. Ask it to admit when it doesn't know.",
      fix: {
        label: "Add 'don't guess' rule",
        line: "- If you are not sure, or the facts you were given don't cover the question, say you don't know instead of guessing.",
      },
    });
  } else {
    findings.push({ id: "uncertainty-rule", severity: "good", title: "Admits when it doesn't know", detail: "Reduces confident wrong answers." });
  }

  // 4. Reply length — short answers are better UX and much faster on a CPU.
  if (!HAS_LENGTH_RULE.test(p)) {
    findings.push({
      id: "length-rule",
      severity: "info",
      title: "No guidance on reply length",
      detail: "Short replies read better on WhatsApp and phones, and each token costs time — about a second per token on a laptop CPU.",
      fix: { label: "Keep replies short", line: "- Keep replies short: 2–4 sentences unless the user asks for more." },
    });
  }

  // 5. Security hardening.
  if (isHardened(p)) {
    findings.push({ id: "hardened", severity: "good", title: "Hardened against prompt injection", detail: "The security rules every Launchpad prompt starts with are in place." });
  } else {
    findings.push({
      id: "hardened",
      severity: "warn",
      title: "Security rules are missing",
      detail: "This prompt lacks the security rules Launchpad prompts start with, so users can more easily make it ignore its instructions or reveal this prompt. Add them back in Test → Security.",
      action: "secure",
    });
  }

  // 6. Language-specific notes from the model card.
  const mentions = (re: RegExp) => re.test(p) || langs.some((l) => re.test(l));
  if (mentions(/yoruba/i) && !/tone marks?/i.test(p)) {
    findings.push({
      id: "yoruba-tone-marks",
      severity: "info",
      title: "Yoruba: ask for tone marks",
      detail: `Yoruba scored lowest in N-ATLAS's human evaluation (${NATLAS_FACTS.yorubaHumanEval}), and replies often drop tone marks, which changes meaning.`,
      fix: { label: "Ask for tone marks", line: "- When writing Yoruba, use correct tone marks (for example ẹ, ọ, ṣ, à, á)." },
    });
  }
  if (mentions(/pidgin/i)) {
    findings.push({
      id: "pidgin-unofficial",
      severity: "info",
      title: "Pidgin isn't an official N-ATLAS language",
      detail: "It often works, but test Pidgin replies carefully with real speakers and save the bad ones as test cases.",
    });
  }

  // 7. Size.
  const promptTokens = estimateTokens(p);
  if (words > 0 && words < 25) {
    findings.push({
      id: "too-short",
      severity: "warn",
      title: "Very short prompt",
      detail: "N-ATLAS follows clear, specific instructions better: say who it serves, its main tasks, and the rules above.",
    });
  }
  if (promptTokens > 2000) {
    findings.push({
      id: "too-long",
      severity: "warn",
      title: `Long prompt (~${promptTokens.toLocaleString("en-US")} tokens)`,
      detail: `N-ATLAS works best within about ${NATLAS_FACTS.contextTokens.toLocaleString("en-US")} tokens in total, and a long prompt leaves less room for your data and the conversation — and is slower on a CPU.`,
    });
  }

  // 8. The security reference code.
  const canary = extractCanary(p);
  if (canary) {
    findings.push({
      id: "canary",
      severity: "info",
      title: "Contains a security reference code",
      detail: `${canary} is a planted code the security tests use to detect leaks of this prompt. Leave it in while testing; you can remove it before launch.`,
    });
  }

  // Budget.
  const dataTokens = input.data?.trim() ? estimateTokens(FACTS_HEADER + input.data.trim()) : 0;
  const reply = Math.max(0, Math.min(input.maxTokens ?? 512, 4096));
  const total = promptTokens + dataTokens + TYPICAL_MESSAGE_TOKENS + reply;
  const limit = NATLAS_FACTS.contextTokens;
  if (total > limit) {
    findings.push({
      id: "over-budget",
      severity: "fix",
      title: "Doesn't fit in N-ATLAS's context window",
      detail: `Prompt, data, a message and the reply come to ~${total.toLocaleString("en-US")} tokens, over the ~${limit.toLocaleString("en-US")} limit. Shorten the prompt, send less data per question (retrieve only the relevant passages), or lower the reply length.`,
    });
  }

  const order: Record<Severity, number> = { fix: 0, warn: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    findings,
    words,
    budget: { systemPrompt: promptTokens, data: dataTokens, message: TYPICAL_MESSAGE_TOKENS, reply, total, limit, share: total / limit },
  };
}

/** Append a rule line to a prompt, before the security reference note if there is one. */
export function applyFix(systemPrompt: string, line: string): string {
  if (systemPrompt.includes(line)) return systemPrompt;
  const lines = systemPrompt.split("\n");
  const noteAt = lines.findIndex((l) => /^\(Internal note:/.test(l.trim()));
  if (noteAt > 0) {
    // Insert before the internal note, keeping a blank line before it.
    const before = lines.slice(0, noteAt);
    while (before.length && !before[before.length - 1].trim()) before.pop();
    return [...before, line, "", ...lines.slice(noteAt)].join("\n");
  }
  return `${systemPrompt.replace(/\s+$/, "")}\n${line}`;
}
