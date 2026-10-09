/**
 * Design chat — the interview that turns a rough idea into an app brief.
 *
 * The engine, not the model, owns the structure: each answer fills a slot,
 * and the existing blueprint generator turns the brief into a use case,
 * architecture and N-ATLAS notes instantly. N-ATLAS only writes the
 * conversational reply (see prompts below), so the plan stays accurate even
 * when the 8B model's reply is weak — and the brief doubles as long-term
 * memory, since N-ATLAS only holds ~8k tokens.
 */

import { generateBlueprint } from "../blueprint/generate.js";
import type { Blueprint } from "../blueprint/types.js";
import { detectLanguage, LANG_NAMES } from "../eval/lang.js";

export const SLOTS = ["idea", "users", "problem", "features", "channel", "languages", "data", "limits"] as const;
export type Slot = (typeof SLOTS)[number] | "notes";

/** The developer's own answers, keyed by the slot they answered. */
export type Answers = Partial<Record<Slot, string>>;

export interface BriefField<T> {
  value: T;
  /** true = the developer said it; false = suggested by the engine. */
  fromYou: boolean;
}

export interface AppBrief {
  idea: BriefField<string>;
  users: BriefField<string>;
  problem: BriefField<string>;
  features: BriefField<string[]>;
  channel: BriefField<string>;
  languages: BriefField<string[]>;
  data: BriefField<string[]>;
  limits: BriefField<string>;
}

export interface DesignSnapshot {
  brief: AppBrief;
  /** The blueprint the brief currently produces (for the canvas preview). */
  blueprint: Blueprint;
  /** The slot the next question asks about, or "done". */
  nextSlot: Slot | "done";
  question: string;
  /** Slots still open, as short labels for the canvas. */
  openQuestions: string[];
}

const LANGUAGE_WORDS = /\b(english|pidgin|yoruba|hausa|igbo|efik|tiv|ijaw|kanuri|fulfulde|edo)\b/i;

/** Split a list-like answer ("a, b and c" / one per line) into items. */
export function splitList(answer: string): string[] {
  return answer
    .split(/\n|;|,|\band\b/i)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

/** Everything the developer has said, as one description for the blueprint engine. */
export function composeDescription(a: Answers): string {
  return [
    a.idea,
    a.users && `It is for ${a.users}`,
    a.problem && `Problem: ${a.problem}`,
    a.features && `It should ${a.features}`,
    a.channel && `Channel: ${a.channel}`,
    a.languages && `Languages: ${a.languages}`,
    a.data && `Data: ${a.data}`,
    a.notes,
  ]
    .filter(Boolean)
    .join(". ");
}

const SLOT_LABEL: Record<(typeof SLOTS)[number], string> = {
  idea: "What the app is",
  users: "Who it's for",
  problem: "The problem it solves",
  features: "Must-have features",
  channel: "Where people use it",
  languages: "Languages",
  data: "Data it needs",
  limits: "What it must never do",
};

function questionFor(slot: Slot, bp: Blueprint): string {
  const plan = bp.buildPlan;
  switch (slot) {
    case "idea":
      return "What would you like to build? Describe it in your own words — English, Pidgin, Yoruba, Hausa or Igbo is fine.";
    case "users":
      return "Who exactly will use it, and where are they? (For example: first-year students at one university, or market traders in Kano.)";
    case "problem":
      return "What problem does it solve for them — what do they do today without it?";
    case "features": {
      const ideas = plan.features.slice(0, 3).map((f) => f.task.toLowerCase());
      return `What are the 2–3 things it must do in the first version?${ideas.length ? ` For a ${plan.useCase.label.toLowerCase()}, people often start with: ${ideas.join("; ")}.` : ""}`;
    }
    case "channel":
      return "Where will people use it — WhatsApp, a website, a mobile app, a game, SMS or Telegram?";
    case "languages":
      return "Which languages should it speak? N-ATLAS officially supports English, Hausa, Igbo and Yoruba; Pidgin works but needs careful testing.";
    case "data": {
      const sources = plan.dataSources.slice(0, 3).map((d) => d.name.toLowerCase());
      return `What information will it need that N-ATLAS can't know on its own?${sources.length ? ` Apps like this usually need: ${sources.join("; ")}.` : " For example your own documents, prices or records."}`;
    }
    case "limits":
      return "Is there anything it must never do, or anything you want to leave out of the first version?";
    default:
      return "Anything else you'd like to change? When you're happy, press Build it.";
  }
}

/** Slots the description already answers clearly enough to skip asking. */
function alreadyKnown(slot: Slot, a: Answers, bp: Blueprint): boolean {
  if (a[slot]) return true;
  const all = composeDescription(a);
  if (slot === "channel") {
    return bp.buildPlan.channel.why.startsWith("Your description mentions") || bp.buildPlan.channel.id === "game";
  }
  if (slot === "languages") return LANGUAGE_WORDS.test(all);
  return false;
}

export function snapshot(answers: Answers, forcedUseCase?: string): DesignSnapshot {
  const description = composeDescription(answers) || "A helpful assistant for Nigerian users";
  const features = answers.features ? splitList(answers.features) : undefined;
  const bp = generateBlueprint(description, {
    useCase: forcedUseCase,
    tasks: features,
    targetUsers: answers.users,
  });

  const brief: AppBrief = {
    idea: { value: answers.idea ?? "", fromYou: !!answers.idea },
    users: { value: answers.users ?? bp.targetUsers, fromYou: !!answers.users },
    problem: { value: answers.problem ?? "", fromYou: !!answers.problem },
    features: { value: features ?? bp.primaryTasks, fromYou: !!features },
    channel: { value: bp.buildPlan.channel.label, fromYou: !!answers.channel || alreadyKnown("channel", answers, bp) },
    languages: { value: bp.languages, fromYou: !!answers.languages || alreadyKnown("languages", answers, bp) },
    data: {
      value: answers.data ? splitList(answers.data) : bp.buildPlan.dataSources.map((d) => d.name),
      fromYou: !!answers.data,
    },
    limits: { value: answers.limits ?? "", fromYou: !!answers.limits },
  };

  const open = SLOTS.filter((s) => !alreadyKnown(s, answers, bp));
  const nextSlot: Slot | "done" = open.length ? open[0] : "done";
  return {
    brief,
    blueprint: bp,
    nextSlot,
    question:
      nextSlot === "done"
        ? "I think we have a clear picture. Check the canvas — tell me anything you'd like to change, or press Build it to generate your blueprint, build guide and tests."
        : questionFor(nextSlot, bp),
    openQuestions: open.map((s) => SLOT_LABEL[s]),
  };
}

// ── Prompt for N-ATLAS's conversational reply ────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY = 6;

export function replyPrompt(snap: DesignSnapshot, history: ChatMessage[]): { system: string; prompt: string } {
  const latest = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const lang = detectLanguage(latest);
  const replyLang = lang.lang === "en" ? "English" : LANG_NAMES[lang.lang];
  const b = snap.brief;
  const plan = snap.blueprint.buildPlan;

  const system =
    "You are the design assistant in N-ATLAS Launchpad. You help a developer shape an app idea that will run on N-ATLAS, " +
    "an open Nigerian language model (Llama-3 8B; English, Hausa, Igbo and Yoruba). Be warm, practical and brief: at most 4 sentences. " +
    "Only state facts about N-ATLAS that appear in the notes you are given. " +
    `Reply in ${replyLang}.`;

  const brief = [
    `App type: ${plan.useCase.label}`,
    b.idea.value && `Idea: ${b.idea.value}`,
    `For: ${b.users.value}`,
    b.problem.value && `Problem: ${b.problem.value}`,
    `Features: ${b.features.value.join("; ")}`,
    `Channel: ${b.channel.value}`,
    `Languages: ${b.languages.value.join(", ")}`,
    `Data: ${b.data.value.join("; ")}`,
    b.limits.value && `Must never: ${b.limits.value}`,
  ]
    .filter(Boolean)
    .join("\n");

  const notes = [...plan.pitfalls.slice(0, 2), ...plan.watchOut.slice(0, 2)].map((n) => `- ${n}`).join("\n");
  const recent = history
    .slice(-MAX_HISTORY)
    .map((m) => `${m.role === "user" ? "Developer" : "You"}: ${m.content}`)
    .join("\n");

  const prompt =
    `App brief so far:\n${brief}\n\nN-ATLAS notes for this kind of app:\n${notes}\n\n` +
    `Recent conversation:\n${recent}\n\n` +
    "Write your next reply. In one or two sentences, show you understood the developer's latest message. " +
    "If one of the notes is relevant, add it as a short tip. " +
    `Then end with exactly this question: "${snap.question}"`;

  return { system, prompt };
}
