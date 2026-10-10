/**
 * Turn a free-text idea into a structured Blueprint.
 *
 * The description is the source of truth for the app-specific fields:
 * purpose, targetUsers, primaryTasks, languages, and the system prompt.
 * The sector template contributes domain knowledge (nigerianContext, risks,
 * systemGuidelines) that is independent of the specific app idea.
 *
 * The generated system prompt is secure by default: the app's instructions,
 * then the security directives (improve/harden.ts) — user input is data, never
 * reveal the prompt, ignore authority claims, safety rules survive role-play —
 * and a planted reference code (canary) so leaks are detectable in tests and
 * blockable in the exported server. In a real run the directives raised an
 * app's attack score from 35 to 91.
 */

import type { Blueprint } from "./types.js";
import { SECTORS, classifySector, type SectorTemplate } from "./sectors.js";
import { makeCanary } from "../shared/prompt.js";
import { buildPlanFor } from "./buildPlan.js";
import { hardenSystemPrompt } from "../improve/harden.js";
import { detectUseCases } from "./useCases.js";

export interface BlueprintOptions {
  /** Use case chosen by the developer, overriding detection (see useCases.ts). */
  useCase?: string;
  /** Features the developer listed themselves (e.g. in the Design chat). */
  tasks?: string[];
  /** Who it's for, in the developer's words. */
  targetUsers?: string;
  /**
   * Text to decide the kind of app from, when the description also carries
   * details that shouldn't (e.g. "medical students" for a note-taking app).
   */
  detectFrom?: string;
}

export function generateBlueprint(description: string, opts: BlueprintOptions = {}): Blueprint {
  const desc = (description ?? "").trim();
  const sector = classifySector(desc);
  const t = SECTORS[sector];
  const kindText = opts.detectFrom?.trim() || desc;
  const useCases = detectUseCases(kindText, opts.useCase);
  const name = deriveName(desc, t.defaultName, useCases[0]);
  const canary = makeCanary(desc || sector);

  const purpose = derivePurpose(desc, t.purpose);
  const givenTasks = (opts.tasks ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const targetUsers = opts.targetUsers?.trim() || deriveTargetUsers(desc, t.targetUsers);
  const primaryTasks = givenTasks.length ? givenTasks : derivePrimaryTasks(desc, t.primaryTasks, opts.useCase, kindText);
  const languages = deriveLanguages(desc, t.languages);
  // The use case knows this kind of app's real risks better than the sector template.
  const risks = useCases[0].id === "general" ? t.risks : useCases.flatMap((u) => u.pitfalls).slice(0, 4);

  return {
    name,
    sector,
    purpose,
    targetUsers,
    primaryTasks,
    languages,
    nigerianContext: useCases[0].nigerianContext ?? t.nigerianContext,
    risks,
    systemPrompt: hardenSystemPrompt(buildSystemPrompt(name, purpose, targetUsers, primaryTasks, languages, t, canary)).newPrompt,
    suggestedEvalCategories: t.suggestedEvalCategories,
    suggestedSecurityTests: t.suggestedSecurityTests,
    buildPlan: buildPlanFor(desc, sector, languages, primaryTasks, opts.useCase, kindText),
  };
}

// ── Normalisation ─────────────────────────────────────────────────────────────

const LEAD_INS =
  /^(i\s+want\s+to\s+build|i'?d\s+like\s+to\s+build|i\s+wanna\s+build|i\s+need\s+a|i\s+want\s+a|build\s+me|please\s+build|let'?s\s+build|build|create|make|develop|design)\s+/i;

function stripLeadIn(s: string): string {
  return s
    .replace(LEAD_INS, "")
    .replace(/^(an?\s+|the\s+)/i, "")
    .replace(/^ai[\s-]+/i, "")
    .trim();
}

const LANG_NAMES = "(?:nigerian[\\s-]?english|nigerian[\\s-]?pidgin|english|yoruba|hausa|igbo|pidgin)";
const LANG_TRAILER = new RegExp(
  `\\s+in\\s+${LANG_NAMES}(?:\\s*(?:,|and)\\s*${LANG_NAMES})*\\s*$`,
  "i",
);

function stripLangTrailer(s: string): string {
  return s.replace(LANG_TRAILER, "").trim();
}

// ── Purpose ───────────────────────────────────────────────────────────────────

/**
 * One-sentence purpose clause used as "You are {name}, {purpose}." — so it is
 * returned lower-case-first, with its article, and without trailing punctuation:
 * "An assistant that advises Nigerian farmers…" → "an assistant that advises Nigerian farmers…"
 */
function derivePurpose(desc: string, fallback: string): string {
  if (!desc) return stripEndPunct(fallback);
  // Only strip "I want to build…"-style lead-ins; keep the article and "AI".
  let s = desc.trim().replace(LEAD_INS, "").trim();
  s = stripEndPunct(stripLangTrailer(stripEndPunct(s)));
  if (s.length < 8) return stripEndPunct(fallback);

  // Lower-case the first word unless it's a proper noun/acronym ("Nigerian", "WhatsApp", "JAMB")
  const first = s.split(/\s+/)[0];
  if (!PROPER_WORDS.test(first) && !/^[A-Z0-9]{2,}$/.test(first) && !/[A-Z]/.test(first.slice(1))) {
    s = s.charAt(0).toLowerCase() + s.slice(1);
  }
  // "Transcribe Yoruba recordings…" is an instruction, not a noun phrase:
  // → "an assistant that helps transcribe Yoruba recordings…"
  if (startsWithVerb(s)) {
    const rest = s.replace(/^(help|assist|support)s?\s+/i, "");
    return `an assistant that helps ${rest}`;
  }
  // Read naturally after "You are {name}," — add an article if there isn't one
  if (!/^(an?|the|my|our|your)\s/i.test(s)) {
    s = `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`;
  }
  return s;
}

/** Descriptions written as an instruction ("Help farmers…", "Transcribe…"). */
const IMPERATIVE_VERBS =
  /^(add|analy[sz]e|answer|assist|book|check|compare|connect|convert|create|detect|explain|fact-check|find|generate|give|guide|help|identify|keep|let|make|manage|match|monitor|plan|predict|recommend|remind|record|review|send|share|show|suggest|summari[sz]e|support|teach|tell|track|transcribe|translate|turn|write)\b/i;

function startsWithVerb(s: string): boolean {
  return IMPERATIVE_VERBS.test(s.trim());
}

const PROPER_WORDS =
  /^(nigerian?s?|yoruba|hausa|igbo|pidgin|lagos|abuja|kano|whatsapp|telegram|naira)$/i;

function stripEndPunct(s: string): string {
  return s.trim().replace(/[.!?]+$/, "").trim();
}

// ── Domain inference (for short descriptions) ────────────────────────────────

interface DomainDefaults {
  users: string;
  tasks: string[];
}

const DOMAIN_KEYWORDS: Array<{ words: string[]; defaults: DomainDefaults }> = [
  {
    words: ["gaming", "game", "games", "esport", "esports", "gamer", "gamers", "play"],
    defaults: {
      users: "Nigerian gamers and gaming enthusiasts",
      tasks: ["Find and discover games", "Get gaming tips and strategies", "Track scores and achievements"],
    },
  },
  {
    words: ["health", "medical", "clinic", "hospital", "doctor", "patient", "medicine", "wellness"],
    defaults: {
      users: "Nigerian patients and health seekers",
      tasks: ["Get health information", "Find healthcare providers", "Understand medical conditions"],
    },
  },
  {
    words: ["food", "recipe", "restaurant", "meal", "cook", "cooking", "delivery", "eat"],
    defaults: {
      users: "Nigerian food lovers and diners",
      tasks: ["Discover Nigerian recipes", "Find restaurants", "Get cooking tips"],
    },
  },
  {
    words: ["travel", "tourism", "hotel", "flight", "trip", "vacation", "transport", "transport"],
    defaults: {
      users: "Nigerian travelers",
      tasks: ["Plan trips", "Find hotels and transportation", "Discover tourist attractions"],
    },
  },
  {
    words: ["job", "jobs", "career", "hiring", "recruitment", "work", "employment", "cv", "resume"],
    defaults: {
      users: "Nigerian job seekers",
      tasks: ["Search for jobs", "Get career advice", "Prepare for interviews"],
    },
  },
  {
    words: ["shop", "shopping", "ecommerce", "store", "product", "buy", "sell", "market", "marketplace"],
    defaults: {
      users: "Nigerian shoppers",
      tasks: ["Discover products", "Track orders", "Get shopping assistance"],
    },
  },
  {
    words: ["property", "real estate", "housing", "house", "rent", "apartment", "land", "landlord"],
    defaults: {
      users: "Nigerian property seekers",
      tasks: ["Search for properties", "Get rental guidance", "Access real estate information"],
    },
  },
  {
    words: ["fitness", "gym", "workout", "exercise", "sport", "sports", "football", "naija"],
    defaults: {
      users: "Nigerian sports and fitness enthusiasts",
      tasks: ["Get fitness tips and workouts", "Track sports results", "Find local sports events"],
    },
  },
  {
    words: ["music", "artist", "song", "playlist", "entertainment", "movie", "film", "nollywood", "afrobeats"],
    defaults: {
      users: "Nigerian entertainment fans",
      tasks: ["Discover Nigerian music and films", "Get artist information", "Find entertainment events"],
    },
  },
  {
    words: ["news", "media", "current affairs", "journalism", "headline"],
    defaults: {
      users: "Nigerian news readers",
      tasks: ["Get the latest Nigerian news", "Explore topics and current affairs", "Stay informed"],
    },
  },
  {
    words: ["ride", "taxi", "transport", "commute", "bus", "uber", "bolt", "logistics", "delivery"],
    defaults: {
      users: "Nigerian commuters",
      tasks: ["Book rides", "Get route and fare estimates", "Track deliveries"],
    },
  },
  {
    words: ["social", "community", "network", "connect", "chat", "messaging", "forum"],
    defaults: {
      users: "Nigerian social media and community users",
      tasks: ["Connect with others", "Share content and ideas", "Discover trending topics"],
    },
  },
];

function inferFromDomain(desc: string): DomainDefaults | null {
  const t = desc.toLowerCase();
  for (const { words, defaults } of DOMAIN_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return defaults;
  }
  return null;
}

// ── Target users ──────────────────────────────────────────────────────────────

const HELP_VERBS = "helps?|assists?|supports?|guides?|advises?|serves?";
const TASK_PIVOTS =
  "with\\b|to\\b|on\\b|about\\b|for\\b|understand\\b|find\\b|track\\b|learn\\b|manage\\b|answer\\b|apply\\b|prepare\\b|navigate\\b|access\\b|explain\\b|provide\\b|book\\b|check\\b";

/** Who the app serves — tries several sentence patterns before giving up. */
function deriveTargetUsers(desc: string, fallback: string): string {
  const s = stripLeadIn(desc);

  // "helps/assists Nigerian farmers with" / "helps students understand"
  const m1 = s.match(
    new RegExp(`(?:${HELP_VERBS})\\s+([A-Za-z][^.]+?)\\s+(?:${TASK_PIVOTS})`, "i"),
  );
  if (m1) {
    const users = clean(m1[1]);
    if (users.length >= 4 && users.split(" ").length <= 6) return capitalise(users);
  }

  // "for [users] to get help/to understand/with X"
  const m2 = s.match(
    /\bfor\s+([A-Za-z][^.]+?)\s+(?:to\s+(?:get\s+)?(?:help|access|find|learn|understand|apply|prepare|use)|with\b)/i,
  );
  if (m2) {
    const users = clean(m2[1]);
    if (users.length >= 4) return capitalise(users);
  }

  // "for [users]" at end of sentence (e.g. "A farming tool for Nigerian smallholders")
  // Require 2+ words to avoid grabbing city/place names like "for Lagos"
  const m3 = s.match(/\bfor\s+([A-Za-z][^.,]+?)(?:\s+in\s+(?:yoruba|hausa|igbo|english)|[.,]|$)/i);
  if (m3) {
    const users = clean(m3[1]);
    if (users.length >= 4 && users.split(" ").length >= 2 && users.split(" ").length <= 5) return capitalise(users);
  }

  // "used by / serving / targeting [users]"
  const m4 = s.match(/(?:used\s+by|serving|targeting|targeted\s+at)\s+([A-Za-z][^.,]+?)(?:[.,]|$)/i);
  if (m4) {
    const users = clean(m4[1]);
    if (users.length >= 4) return capitalise(users);
  }

  // Short description fallback — infer from domain keywords
  const domain = inferFromDomain(desc);
  if (domain) return domain.users;

  return fallback;
}

// ── Primary tasks ─────────────────────────────────────────────────────────────

const ACTION_VERBS =
  "understand|find|track|learn|manage|create|access|answer|advise|guide|explain|provide|handle|process|review|prepare|navigate|compare|calculate|check|discover|explore|book|register|apply|get|receive|submit|verify";

/**
 * What the app does. Tasks extracted from the description come first; if there
 * are fewer than four, the sector template tops them up with concrete,
 * non-overlapping features.
 */
function derivePrimaryTasks(desc: string, fallback: string[], forcedUseCase?: string, kindText = desc): string[] {
  const extracted = extractPrimaryTasks(desc, fallback);
  // Tasks the developer actually wrote come first. Otherwise prefer the
  // detected use case's feature list over keyword guesses and the sector
  // template, which are often wrong for the specific idea.
  const domain = inferFromDomain(desc);
  const guessed = extracted === fallback || (domain !== null && sameList(extracted, domain.tasks));
  const useCases = detectUseCases(kindText, forcedUseCase).filter((u) => u.tasks.length);
  if (guessed && useCases.length) {
    // One use case: all its tasks. Two: the first three of each.
    const per = useCases.length === 1 ? MAX_TASKS : 3;
    return useCases.flatMap((u) => u.tasks.slice(0, per).map((t) => t.task)).slice(0, MAX_TASKS + 1);
  }
  if (extracted === fallback) return fallback;
  return topUpTasks(extracted, fallback);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const MAX_TASKS = 5;

function topUpTasks(tasks: string[], sectorTasks: string[]): string[] {
  const out = [...tasks];
  for (const st of sectorTasks) {
    if (out.length >= 4 || out.length >= MAX_TASKS) break;
    if (!out.some((t) => overlaps(t, st))) out.push(st);
  }
  return out.slice(0, MAX_TASKS);
}

const STOP_WORDS = new Set(["with", "and", "the", "for", "on", "of", "help", "get", "advice", "advise", "about", "your", "their"]);

/** Two tasks overlap when they share a meaningful (stemmed) keyword. */
function overlaps(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 3 && !STOP_WORDS.has(w)).map((w) => w.replace(/s$/, "")) ?? [],
    );
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
}

/**
 * Turn a bare topic ("pests") into a concrete feature when we recognise it.
 * Unknown topics keep the "{verb} {topic}" form.
 */
const CONCRETE_TOPICS: Array<[RegExp, string]> = [
  [/^pests?( and diseases?)?$|^crop diseases?$/, "Identify pests and diseases from a description and suggest safe, approved controls"],
  [/^planting (seasons?|times?|calendar)$/, "Recommend planting windows by crop, region and rainy season"],
  [/^crops?$/, "Recommend suitable crops for a location, season and budget"],
  [/^(soil|fertili[sz]ers?)$/, "Explain soil care and fertiliser use in local units"],
  [/^(prices?|markets?|market prices?)$/, "Explain market and pricing considerations (without guaranteeing prices)"],
  [/^(livestock|poultry)$/, "Answer livestock and poultry care questions"],
  [/^(budget(ing)?|savings?)$/, "Help plan a budget or savings goal in naira"],
  [/^(loans?|credit)$/, "Explain loan and credit terms, fees and risks"],
  [/^(scams?|fraud)$/, "Spot common scams and unsafe requests (e.g. BVN/OTP)"],
  [/^(orders?|deliver(y|ies)|order tracking)$/, "Track orders and explain delivery status and next steps"],
  [/^(refunds?|returns?)$/, "Walk customers through refunds and returns"],
  [/^(admissions?|jamb|utme)$/, "Explain JAMB/UTME and admission requirements step by step"],
  [/^(rights?|tenancy|landlords?)$/, "Explain rights and the steps to take, in plain language"],
];

function concretise(topic: string, verb: string): string {
  const t = topic.toLowerCase().trim();
  for (const [re, task] of CONCRETE_TOPICS) if (re.test(t)) return task;
  return `${verb} ${upAcronyms(t)}`;
}

function extractPrimaryTasks(desc: string, fallback: string[]): string[] {
  const s = stripLeadIn(desc);

  // Strategy 1: explicit comma/and list after "with" or "on"
  // "helps farmers with crops, planting seasons and pests"
  // "advises farmers on crops, planting seasons and pests"
  const withMatch = s.match(
    /\b(?:with|on)\s+([A-Za-z][^!?]+?)(?:\s+in\s+(?:yoruba|hausa|igbo|english|nigerian|pidgin)[^!?.]*)?(?:[!?.]|$)/i,
  );
  if (withMatch) {
    const raw = stripLangTrailer(withMatch[1].trim().replace(/\.$/, ""));
    const items = splitList(raw);
    if (items.length >= 2) {
      // Use a verb that matches what the description says the app does
      const taskVerb = pickTaskVerb(s);
      // Several topics can map to the same concrete feature ("orders", "delivery")
      return [...new Set(items.map((t) => concretise(t, taskVerb)))];
    }
  }

  // Strategy 2: "helps [users] [verb] [object]" — single action
  // "helps students understand admission requirements"
  const actionMatch = s.match(
    new RegExp(
      `(?:${HELP_VERBS})\\s+\\S+(?:\\s+\\S+){0,3}\\s+((?:${ACTION_VERBS})\\s+[^!?.]+?)(?:\\s+in\\s+(?:yoruba|hausa|igbo|english)|[!?.]|$)`,
      "i",
    ),
  );
  if (actionMatch) {
    const action = stripLangTrailer(actionMatch[1].trim().replace(/\.$/, ""));
    if (action.length >= 6) return [capitalise(action)];
  }

  // Strategy 3: "to [verb] [object]" goal phrase — keep the verb in the task
  // "to understand their rights" → "Understand their rights"
  const toMatch = s.match(
    new RegExp(
      `\\bto\\s+((?:get\\s+(?:help\\s+with|access\\s+to)|(?:${ACTION_VERBS}))\\s+[^!?.]+?)(?:\\s+in\\s+(?:yoruba|hausa|igbo|english)|[!?.]|$)`,
      "i",
    ),
  );
  if (toMatch) {
    const raw = stripLangTrailer(toMatch[1].trim().replace(/\.$/, ""));
    const items = splitList(raw);
    if (items.length >= 1) return items.map((t) => capitalise(t.trim()));
  }

  // Strategy 4a: present-participle list — "handling orders, returns and tracking"
  const participleMatch = s.match(
    /\b(?:handling|managing|processing|tracking|supporting|providing|offering|covering)\s+([A-Za-z][^!?.]+?)(?:\s+in\s+(?:yoruba|hausa|igbo|english)|[!?.]|$)/i,
  );
  if (participleMatch) {
    const raw = stripLangTrailer(participleMatch[1].trim().replace(/\.$/, ""));
    const items = splitList(raw);
    if (items.length >= 2) return items.map((t) => capitalise(t.trim()));
  }

  // Strategy 4b: "answers/handles X questions/queries" — common pattern for QA bots
  const answersMatch = s.match(
    /(?:answers?|handles?|responds?\s+to)\s+([A-Za-z][^!?.]+?)\s+(?:questions?|queries?|inquiries?)/i,
  );
  if (answersMatch) {
    const topic = stripLangTrailer(answersMatch[1].trim().replace(/\.$/, ""));
    if (topic.length >= 3) return [`Answer ${topic} questions`];
  }

  // Strategy 5: single "with X" (no list, fall-through from strategy 1)
  if (withMatch) {
    const raw = stripLangTrailer(withMatch[1].trim().replace(/\.$/, ""));
    if (raw.length >= 4) {
      const taskVerb = pickTaskVerb(s);
      return [concretise(raw, taskVerb)];
    }
  }

  // Strategy 6: domain inference for short/keyword descriptions
  const domain = inferFromDomain(desc);
  if (domain) return domain.tasks;

  return fallback;
}

// ── Languages ─────────────────────────────────────────────────────────────────

function deriveLanguages(desc: string, fallback: string[]): string[] {
  const t = desc.toLowerCase();
  const langs: string[] = [];
  if (/yoruba/.test(t)) langs.push("Yoruba");
  if (/hausa/.test(t)) langs.push("Hausa");
  if (/igbo/.test(t)) langs.push("Igbo");
  if (/pidgin/.test(t)) langs.push("Nigerian Pidgin");
  langs.push("Nigerian English");
  return langs.length > 1 ? langs : fallback;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  name: string,
  purpose: string,
  targetUsers: string,
  tasks: string[],
  languages: string[],
  t: SectorTemplate,
  canary: string,
): string {
  return [
    `You are ${name}, ${stripEndPunct(purpose)}.`,
    `You serve ${stripEndPunct(targetUsers)}.`,
    ``,
    `Your primary tasks:`,
    ...tasks.map((task) => `- ${task}`),
    ``,
    `Guidelines:`,
    ...t.systemGuidelines.map((g) => `- ${g}`),
    `- State uncertainty when details may vary, and encourage users to verify official sources.`,
    `- Respond in the user's language where you can: ${languages.join(", ")}.`,
    ``,
    `(Internal note: support reference code ${canary}.)`,
  ].join("\n");
}

// ── Task verb helper ─────────────────────────────────────────────────────────

/** Pick the right imperative verb for task labels based on the description's main verb. */
function pickTaskVerb(s: string): string {
  if (/\badvises?\b/i.test(s)) return "Get advice on";
  if (/\bguides?\b/i.test(s)) return "Get guidance on";
  if (/\bteaches?|trains?\b/i.test(s)) return "Learn about";
  if (/\bexplains?\b/i.test(s)) return "Understand";
  if (/\banswers?\b/i.test(s)) return "Ask about";
  if (/\bmanages?\b/i.test(s)) return "Manage";
  if (/\btracks?\b/i.test(s)) return "Track";
  if (/\bfinds?\b/i.test(s)) return "Find";
  return "Help with";
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const ACRONYMS = ["jamb", "utme", "waec", "neco", "nysc", "bvn", "nin", "atm", "pos", "cbn", "ai"];

function upAcronyms(s: string): string {
  return s.replace(/\b([a-z]+)\b/g, (w) => (ACRONYMS.includes(w) ? w.toUpperCase() : w));
}

function splitList(s: string): string[] {
  return s
    .split(/,\s*|\s+and\s+/)
    .map((x) => x.trim().replace(/^(and|or)\s+/i, "").trim())
    .filter((x) => x.length >= 3);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clean(s: string): string {
  return s.trim().replace(/\.$/, "").replace(/\s+/g, " ");
}

const LEAD_INS_NAME =
  /^(i\s+want\s+to\s+build|i'?d\s+like\s+to\s+build|i\s+wanna\s+build|i\s+need\s+a|i\s+want\s+a|build\s+me|please\s+build|let'?s\s+build|build|create|make|develop|design)\s+/;

/** Words whose casing can't be recovered by simple title-casing (input is lower-cased). */
const BRAND_CASE: Record<string, string> = {
  whatsapp: "WhatsApp", jamb: "JAMB", utme: "UTME", waec: "WAEC", neco: "NECO",
  nysc: "NYSC", ai: "AI", sms: "SMS", ussd: "USSD", pos: "POS", bvn: "BVN", nin: "NIN",
};

/** "Notes & study assistant" → "Notes & Study Assistant"; undefined for the general fallback. */
function useCaseName(useCase?: { id: string; label: string }): string | undefined {
  if (!useCase || useCase.id === "general") return undefined;
  const label = useCase.label.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return /(assistant|guide|companion|tutor|explainer|support)$/i.test(label) ? label : `${label} Assistant`;
}

function deriveName(description: string, fallback: string, useCase?: { id: string; label: string }): string {
  if (!description) return fallback;
  let s = description.toLowerCase().trim();
  s = s.replace(LEAD_INS_NAME, "");
  // An instruction ("transcribe yoruba meetings…") has no product noun to name
  // the app after, so use the kind of app instead.
  if (startsWithVerb(s)) return useCaseName(useCase) ?? fallback;
  s = s.replace(/^(an?|the)\s+/, "");
  s = s.replace(/^ai\s+/, "");
  // Cut at a relative clause, comparison or "to get/give/provide help":
  // "gaming app like the sims where characters…" → "gaming app"
  s = s.split(/\s+(?:that|which|who|whose|where|like|with|in\s+which|to\s+(?:get|give|provide|find)?\s*help|for\s+helping|so\s+that)\s+/)[0];
  // Remove "for [users]" suffix — keep only the type of tool
  s = s.replace(/\s+for\s+.+$/, "");
  // Remove language trailer
  s = s.replace(LANG_TRAILER, "");
  s = s.replace(/[.?!].*$/, "").trim();

  const words = s.split(/\s+/).filter(Boolean).slice(0, 6);
  // Nothing to name it after ("an app that helps…" → "app"): name it after
  // the kind of app rather than the sector default, which may be unrelated.
  if (words.length < 2) return useCaseName(useCase) ?? fallback;

  let name = words.map((w) => BRAND_CASE[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  if (!/(assistant|bot|helper|advisor|guide|tool|app|chatbot)\b/i.test(name)) {
    name = `${name} Assistant`;
  }
  return name;
}
