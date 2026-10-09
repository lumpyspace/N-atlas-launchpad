/**
 * Application blueprint — the structured plan generated from a developer's
 * free-text idea. Deterministic (template-driven); no LLM call required.
 */

import type { BuildPlan } from "./buildPlan.js";

export type Sector =
  | "education"
  | "finance"
  | "agriculture"
  | "legal"
  | "customer-support"
  | "general";

export interface Blueprint {
  /** Human-facing application name, e.g. "Nigerian University Admissions Assistant". */
  name: string;
  sector: Sector;
  /** One-line description of what the app does (reads after "You are {name}, "). */
  purpose: string;
  targetUsers: string;
  primaryTasks: string[];
  languages: string[];
  nigerianContext: string[];
  risks: string[];
  /** The generated, editable system prompt (contains a planted canary). */
  systemPrompt: string;
  suggestedEvalCategories: string[];
  suggestedSecurityTests: string[];
  /** How to actually build this app with N-ATLAS: architecture, steps, fit, licence. */
  buildPlan: BuildPlan;
}
