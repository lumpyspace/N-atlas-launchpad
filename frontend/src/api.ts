/**
 * Thin client for the N-ATLAS Launchpad backend REST API.
 *
 * In dev, Vite proxies /api to http://localhost:8787 (see vite.config.ts).
 * In production you can override the base URL with VITE_API_BASE_URL.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface HealthStatus {
  ok: boolean;
  provider: string;
  isMock: boolean;
  endpoint: string | null;
  model: string;
  detail: string;
  checkedAt: string;
  /** A hosted Launchpad: the host's N-ATLAS server, which visitors can't change. */
  public?: boolean;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: string;
  isMock: boolean;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}

/** Reconfigure the backend to point at a different Ollama/vLLM endpoint. */
export async function switchMode(opts: {
  endpoint: string;
  model?: string;
  apiKey?: string;
}): Promise<HealthStatus> {
  const res = await fetch(`${BASE}/api/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "http", ...opts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface GenerateOptions {
  system?: string;
  language?: string;
  temperature?: number;
  maxTokens?: number;
}

export type StreamEvent =
  | { type: "delta"; delta: string }
  | { type: "stats"; ttftMs: number; totalMs: number; tokensGenerated: number; tokensPerSec: number }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Streaming generate — yields deltas as they arrive, then a stats event, then done.
 * Throws on HTTP errors; does not throw on graceful abort (AbortError).
 */
export async function* streamGenerate(
  prompt: string,
  options?: GenerateOptions,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/generate/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, options }),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    throw e;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        throw e;
      }
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
          yield event;
          if (event.type === "done" || event.type === "error") return;
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

export async function generate(
  prompt: string,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Evaluation engine -----------------------------------------------------

export interface SuiteInfo {
  name: string;
  description: string;
  cases: number;
}

export interface CheckResult {
  label: string;
  type: string;
  passed: boolean;
  detail: string;
  weight: number;
}

export interface CaseResult {
  caseId: string;
  category: string;
  language?: string;
  prompt: string;
  output: string;
  isMock: boolean;
  passed: boolean;
  score: number;
  checks: CheckResult[];
  latencyMs: number;
  error?: string;
  /** What the case probes, e.g. "Answers in Yoruba when asked in Yoruba". */
  description?: string;
}

export interface SuiteRunResult {
  suite: string;
  provider: string;
  model: string;
  isMock: boolean;
  /** True when the run was stopped before every case ran. */
  partial?: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    passRate: number;
    byCategory: Record<string, { total: number; passed: number }>;
  };
  cases: CaseResult[];
}

export async function getSuites(): Promise<{ suites: SuiteInfo[]; default: string }> {
  const res = await fetch(`${BASE}/api/suites`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function runEvaluation(
  suite: string,
  maxCases?: number,
): Promise<SuiteRunResult> {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suite, maxCases }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** Run the sector evaluation suite against an app's own system prompt. */
export async function runAppEvaluation(
  sector: string,
  systemPrompt: string,
  description?: string,
  maxCases?: number,
): Promise<SuiteRunResult> {
  const res = await fetch(`${BASE}/api/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sector, systemPrompt, description, maxCases }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Blueprint (Describe → Build) ------------------------------------------

export type Sector =
  | "education"
  | "finance"
  | "agriculture"
  | "legal"
  | "customer-support"
  | "general";

export interface Blueprint {
  name: string;
  sector: Sector;
  purpose: string;
  targetUsers: string;
  primaryTasks: string[];
  languages: string[];
  nigerianContext: string[];
  risks: string[];
  systemPrompt: string;
  /** Who wrote the system prompt when it wasn't the template (e.g. "Groq"). */
  promptBy?: string;
  suggestedEvalCategories: string[];
  suggestedSecurityTests: string[];
  /** Missing on blueprints saved before build plans existed. */
  buildPlan?: BuildPlan;
}

/** Mirror of backend/src/blueprint/buildPlan.ts */
export interface BuildPlan {
  useCase: { ids: string[]; label: string; summary: string };
  mvp: string[];
  dataSources: { name: string; why: string; kind: "documents" | "live-data" | "your-content" }[];
  features: {
    task: string;
    approach: "prompt" | "retrieval" | "lookup" | "compute" | "schedule" | "vision" | "speech";
    approachLabel: string;
    how: string;
  }[];
  pitfalls: string[];
  metrics: string[];
  conversation: { user: string; app: string };
  testMessages: string[];
  starter: { filename: string; setup: string; code: string };
  playground?: PlaygroundSpec;
  channel: { id: string; label: string; why: string };
  voice: { needed: boolean; models: { lang: string; model: string }[] };
  knowledge: { needed: boolean; why: string; kind: "documents" | "live-data" | "none" };
  architecture: { label: string; detail: string; kind: "user" | "yours" | "natlas" | "optional" }[];
  steps: {
    title: string;
    detail: string;
    code?: string;
    launchpadStep?: "playground" | "evaluate" | "compare" | "secure" | "export";
  }[];
  goodFit: string[];
  watchOut: string[];
  license: string[];
}

/** `useCase` forces a kind of app when automatic detection got it wrong. */
export async function getBlueprint(
  description: string,
  useCase?: string,
  extra: { tasks?: string[]; targetUsers?: string; promptBy?: false } = {},
): Promise<Blueprint> {
  const res = await fetch(`${BASE}/api/blueprint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description, useCase, ...extra }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface UseCaseOption {
  id: string;
  label: string;
  summary: string;
}

export async function getUseCases(): Promise<UseCaseOption[]> {
  const res = await fetch(`${BASE}/api/use-cases`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).useCases;
}

// --- Security engine (Attack Your Application) -----------------------------

export type Severity = "low" | "medium" | "high" | "critical";

export interface SecurityResult {
  id: string;
  category: string;
  severity: Severity;
  prompt: string;
  expectedBehavior: string;
  passed: boolean;
  response: string;
  explanation: string;
  mitigation: string;
  isMock: boolean;
  latencyMs: number;
  error?: string;
}

export interface SecurityRunResult {
  provider: string;
  model: string;
  isMock: boolean;
  /** True when the run was stopped before every test ran. */
  partial?: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    score: number;
    byCategory: Record<string, { total: number; passed: number }>;
    bySeverity: Record<string, { total: number; passed: number }>;
  };
  results: SecurityResult[];
}

/** Run the attack suite against an app's system prompt. `only` re-tests ids. */
export async function runSecurity(
  systemPrompt: string,
  only?: string[],
): Promise<SecurityRunResult> {
  const res = await fetch(`${BASE}/api/security`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemPrompt, only }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Improve ----------------------------------------------------------------

export interface Improvement {
  newPrompt: string;
  changes: string[];
  /** The appended SECURITY DIRECTIVES block alone (for showing the diff). */
  addedBlock: string;
}

export async function getImprovement(
  systemPrompt: string,
  failedCategories: string[],
): Promise<Improvement> {
  const res = await fetch(`${BASE}/api/improve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemPrompt, failedCategories }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Test checks (mirror of backend/src/eval/types.ts `Check`) ────────────────

export type LangCode = "en" | "pid" | "yo" | "ha" | "ig";

export type Check =
  | { type: "containsAny"; values: string[]; label?: string }
  | { type: "containsAll"; values: string[]; label?: string }
  | { type: "notContains"; values: string[]; label?: string }
  | { type: "regex"; pattern: string; flags?: string; label?: string }
  | { type: "minLength"; chars: number; label?: string }
  | { type: "maxLength"; chars: number; label?: string }
  | { type: "refusal"; expected: boolean; label?: string }
  | { type: "language"; lang: LangCode; label?: string }
  | { type: "noRepetition"; maxRepeats?: number; label?: string }
  | { type: "maxLatency"; ms: number; label?: string }
  | { type: "jsonShape"; schema: Record<string, JsonType>; label?: string };

export type JsonType = "string" | "number" | "boolean" | "array" | "object";

/** Mirror of backend/src/blueprint/playground.ts */
export interface TaskTemplate {
  id: string;
  label: string;
  hint: string;
  fields: { name: string; label: string; placeholder?: string; default?: string; multiline?: boolean }[];
  prompt: string;
  output: "text" | "json";
  schema?: Record<string, JsonType>;
  maxTokens?: number;
}

export interface PlaygroundSpec {
  mode: "chat" | "task";
  templates: TaskTemplate[];
  dataLabel?: string;
  sampleData?: string;
}

/** A developer test case sent to the runner. */
export interface CustomCaseInput {
  id: string;
  prompt: string;
  language?: string;
  description?: string;
  /** Facts added to the system prompt for this case ("Your data"). */
  context?: string;
  checks: Check[];
}

// ── Streaming test runs ──────────────────────────────────────────────────────

export type RunEvent<R, Run> =
  | { type: "start"; total: number }
  | { type: "case"; done: number; total: number; result: R }
  | { type: "done"; run: Run }
  | { type: "error"; message: string };

/**
 * POST to an SSE run endpoint and feed each event to `onEvent`. Resolves with
 * the final run, or null if the run was stopped before it finished.
 */
async function streamRun<R, Run>(
  path: string,
  body: unknown,
  onEvent: (e: RunEvent<R, Run>) => void,
  signal?: AbortSignal,
): Promise<Run | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Run | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data: ")) continue; // heartbeats are ": keep-alive"
        let event: RunEvent<R, Run>;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") final = event.run;
        onEvent(event);
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
  return final;
}

export function streamAppEvaluation(
  body: {
    sector: string;
    systemPrompt: string;
    description?: string;
    customCases?: CustomCaseInput[];
    scope?: "all" | "custom";
    quick?: boolean;
  },
  onEvent: (e: RunEvent<CaseResult, SuiteRunResult>) => void,
  signal?: AbortSignal,
): Promise<SuiteRunResult | null> {
  return streamRun("/api/evaluate/stream", body, onEvent, signal);
}

export function streamSecurity(
  body: { systemPrompt: string; only?: string[]; quick?: boolean },
  onEvent: (e: RunEvent<SecurityResult, SecurityRunResult>) => void,
  signal?: AbortSignal,
): Promise<SecurityRunResult | null> {
  return streamRun("/api/security/stream", body, onEvent, signal);
}

// ── Compare ──────────────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  model: string;
}

export async function getModels(): Promise<ModelOption[]> {
  const res = await fetch(`${BASE}/api/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).models;
}

export interface CompareVariant {
  id: string;
  label: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
}

export interface CompareSummary {
  variantId: string;
  total: number;
  passed: number;
  avgLatencyMs: number;
}

export type CompareEvent =
  | { type: "start"; total: number }
  | { type: "cell"; caseId: string; variantId: string; done: number; total: number; result: CaseResult }
  | { type: "done"; summary: CompareSummary[]; partial: boolean }
  | { type: "error"; message: string };

/** Stream a compare run. Resolves when the stream ends (or is stopped). */
export async function streamCompare(
  body: { variants: CompareVariant[]; cases: CustomCaseInput[] },
  onEvent: (e: CompareEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamRun<never, never>(
    "/api/compare/stream",
    body,
    (e) => onEvent(e as unknown as CompareEvent),
    signal,
  );
}

// ── Design chat ──────────────────────────────────────────────────────────────

export type DesignSlot = "idea" | "users" | "problem" | "features" | "channel" | "languages" | "data" | "limits" | "notes";

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
  blueprint: Blueprint;
  nextSlot: DesignSlot | "done";
  question: string;
  openQuestions: string[];
}

export interface DesignMessage {
  role: "user" | "assistant";
  content: string;
  /** The reply (or question) in English, when it was said in another language. */
  english?: string;
  /** User messages: N-ATLAS's English reading of them (when an assistant model thought about them). */
  understood?: string;
  /** Assistant messages: the model that did the thinking (e.g. Gemini), when one did. */
  brain?: string;
  /** Assistant messages: who wrote the words shown ("N-ATLAS", or the assistant model). */
  voice?: string;
}

export type DesignEvent =
  | { type: "snapshot"; snapshot: DesignSnapshot }
  | { type: "delta"; delta: string }
  | { type: "warning"; message: string }
  /** The question this turn asks, in English (sent when replying in another language). */
  | { type: "question"; english: string }
  /** N-ATLAS's English reading of the developer's words (assistant model on). */
  | { type: "understood"; english: string }
  /** Who thought and who wrote the reply (assistant model on). */
  | { type: "via"; brain?: string; voice: string }
  /** Discard the streamed reply: it's being written again. */
  | { type: "reset" }
  | { type: "done" };

/** One Design chat turn: snapshot first (instant), then the streamed reply. */
export async function streamDesignTurn(
  body: {
    answers: Partial<Record<DesignSlot, string>>;
    history: DesignMessage[];
    useCase?: string;
    /** false = just recompute the brief/canvas, no N-ATLAS reply. */
    reply?: boolean;
    /** The project's language: N-ATLAS replies and asks its questions in it. */
    language?: string;
  },
  onEvent: (e: DesignEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamRun<never, never>("/api/design/turn", body, (e) => onEvent(e as unknown as DesignEvent), signal);
}

// ── Prompt studio ────────────────────────────────────────────────────────────

export interface PromptFinding {
  id: string;
  severity: "fix" | "warn" | "info" | "good";
  title: string;
  detail: string;
  fix?: { label: string; line: string };
  action?: "secure";
}

export interface PromptBudget {
  systemPrompt: number;
  data: number;
  message: number;
  reply: number;
  total: number;
  limit: number;
  share: number;
}

export interface PromptDiagnosis {
  findings: PromptFinding[];
  budget: PromptBudget;
  words: number;
}

export async function diagnosePrompt(
  body: { systemPrompt: string; data?: string; languages?: string[]; needsKnowledge?: boolean; maxTokens?: number },
  signal?: AbortSignal,
): Promise<PromptDiagnosis> {
  const res = await fetch(`${BASE}/api/prompt/doctor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── N-ATLAS writes the build guide ───────────────────────────────────────────

export type NarrationSection =
  | "purpose" | "summary" | "conversation" | "mvp" | "features" | "pitfalls"
  | "audience" | "context" | "risks";
export const NARRATION_SECTIONS: NarrationSection[] = [
  "purpose", "summary", "conversation", "mvp", "features", "pitfalls", "audience", "context", "risks",
];

export type NarrationValue = string | string[] | { user: string; app: string } | { task: string; how: string }[];

export type NarrationEvent =
  | { type: "start"; section: NarrationSection }
  | { type: "delta"; section: NarrationSection; delta: string }
  /** by: who thought (brain, "" for N-ATLAS alone) and who wrote the words shown (voice). */
  | { type: "section"; section: NarrationSection; value?: NarrationValue; problem?: string; by?: { brain: string; voice: string } }
  | { type: "error"; section: NarrationSection; message: string }
  | { type: "done" };

/** N-ATLAS writes the guide's sections in the project's language, one after another. */
export async function streamNarration(
  body: { blueprint: Blueprint; language: string; sections?: NarrationSection[] },
  onEvent: (e: NarrationEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamRun<never, never>("/api/blueprint/narrate", body, (e) => onEvent(e as unknown as NarrationEvent), signal);
}

// ── Setup doctor ─────────────────────────────────────────────────────────────

export type DoctorCheckId = "endpoint" | "model" | "build" | "context" | "settings" | "reply" | "speed" | "hardware";
export const DOCTOR_CHECKS: DoctorCheckId[] = ["endpoint", "model", "build", "context", "settings", "reply", "speed", "hardware"];

export interface DoctorResult {
  id: DoctorCheckId;
  status: "pass" | "warn" | "fail" | "info" | "skip";
  /** Which explanation applies (the page holds the text, so it can be translated). */
  variant: string;
  data: Record<string, string | number>;
  command?: string;
}

export type DoctorEvent = { type: "check"; result: DoctorResult } | { type: "error"; message: string } | { type: "done" };

/** Run the setup doctor; checks arrive one by one. */
export async function streamDoctor(onEvent: (e: DoctorEvent) => void, signal?: AbortSignal): Promise<void> {
  await streamRun<never, never>("/api/doctor", {}, (e) => onEvent(e as unknown as DoctorEvent), signal);
}

// ── Go live ──────────────────────────────────────────────────────────────────

/** What the live-link check found (backend/src/deploy/check.ts). */
export interface LiveCheck {
  url: string;
  checkedAt: string;
  page: { ok: boolean; ms?: number; title?: string; problem?: string };
  chat: { ok: boolean; ms?: number; reply?: string; problem?: string };
  guards: { ok: boolean; problem?: string };
}

/** The project the Go live guide explains. */
export interface GuideProject {
  name: string;
  lang: "js" | "python";
  channel: string;
  knowledge: boolean;
}

/** Ask the Go live guide; events as in the Design chat (question = the answer in English). */
export async function streamDeployAnswer(
  body: { project: GuideProject; history: DesignMessage[]; language?: string },
  onEvent: (e: DesignEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const history = body.history.map((m) => ({ role: m.role, content: m.content }));
  await streamRun<never, never>("/api/deploy/ask", { ...body, history }, (e) => onEvent(e as unknown as DesignEvent), signal);
}

/** Open the live app like a first visitor: the page, an N-ATLAS answer, the safety checks. */
export async function checkLiveLink(url: string, message: string): Promise<LiveCheck> {
  const res = await fetch(`${BASE}/api/deploy/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, message }),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as LiveCheck;
}

// ── Page helper ──────────────────────────────────────────────────────────────

/** Where the person is, so the helper's answers fit (backend/src/help/helper.ts). */
export interface HelpContext {
  page: string;
  mode: "simple" | "developer";
  project?: { name: string; kind?: string; stages: { label: string; done: boolean; detail: string }[]; next?: string };
}

/** Ask the page helper; events as in the Design chat. */
export async function streamHelpAnswer(
  body: { history: DesignMessage[]; language?: string; context: HelpContext },
  onEvent: (e: DesignEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const history = body.history.map((m) => ({ role: m.role, content: m.content }));
  await streamRun<never, never>("/api/help/ask", { ...body, history }, (e) => onEvent(e as unknown as DesignEvent), signal);
}

// ── Published assistants (building blocks) ──────────────────────────────────

export interface PriceItem {
  name: string;
  unit: string;
  /** Naira; null until the owner sets it. */
  price: number | null;
  note?: string;
}

/** Plugins (WordPress-style): features switched on or off. */
export interface Blocks {
  assistant: { on: boolean };
  info: { on: boolean; text: string };
  prices: { on: boolean; items: PriceItem[] };
  orders: { on: boolean; kind: "order" | "booking" | "enquiry"; fields: string[] };
  contact: { on: boolean; whatsapp: string; phone: string; hours: string };
}

export type Section =
  | { type: "hero"; heading: string; text: string; button: "chat" | "order" | "whatsapp" | "none" }
  | { type: "text"; heading: string; text: string }
  | { type: "faq"; heading: string; items: { q: string; a: string }[] }
  | { type: "prices"; heading: string }
  | { type: "contact"; heading: string };

export interface Page {
  id: string;
  title: string;
  /** "" for the home page. */
  slug: string;
  inMenu: boolean;
  sections: Section[];
  /** The owner has checked this page. Until then it's a draft by Groq, and the assistant doesn't take facts from it. */
  reviewed?: boolean;
}

export type ThemeId = "market" | "clean" | "warm" | "night";

export interface AssistantConfig {
  /** Site title. */
  name: string;
  tagline: string;
  greeting: string;
  language: string;
  instructions: string;
  blocks: Blocks;
  theme: { id: ThemeId; accent: string };
  pages: Page[];
}

export interface SiteTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SiteAnswer {
  reply: string;
  english: string;
  language: string;
  voice: string;
  brain?: string;
  /** Preview: the order it would save. Live: { saved: true }. */
  order?: { fields?: Record<string, string>; kind?: string; saved?: boolean };
  orderKey?: string;
}

export interface InboxItem {
  id: string;
  kind: string;
  fields: Record<string, string>;
  language: string;
  at: string;
}

/** What visitors see of a site (and what the admin previews). */
export interface PublicSite {
  slug: string;
  name: string;
  tagline: string;
  greeting: string;
  language: string;
  theme: { id: ThemeId; accent: string };
  pages: Page[];
  assistant: boolean;
  orders: { kind: string } | null;
  prices: PriceItem[] | null;
  contact: { whatsapp: string; phone: string; hours: string } | null;
}

/** The public view of a config — what the live site will show. */
export function viewOf(c: AssistantConfig, slug = ""): PublicSite {
  return {
    slug,
    name: c.name,
    tagline: c.tagline,
    greeting: c.greeting,
    language: c.language,
    theme: c.theme,
    pages: c.pages,
    assistant: c.blocks.assistant.on,
    orders: c.blocks.orders.on ? { kind: c.blocks.orders.kind } : null,
    prices: c.blocks.prices.on ? c.blocks.prices.items : null,
    contact: c.blocks.contact.on ? { whatsapp: c.blocks.contact.whatsapp, phone: c.blocks.contact.phone, hours: c.blocks.contact.hours } : null,
  };
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}
const post = (path: string, body: unknown, key?: string, method = "POST") =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(key ? { "x-owner-key": key } : {}) },
    body: JSON.stringify(body),
  });

export const siteStatus = () => fetch(`${BASE}/api/sites/status`).then((r) => json<{ canPublish: boolean; store: string | null; reason?: string }>(r));
export const draftSite = (blueprint: Blueprint, language: string, knowledge: string) =>
  post("/api/sites/draft", { blueprint, language, knowledge }).then((r) => json<{ config: AssistantConfig; by: string }>(r));
export const previewSite = (config: AssistantConfig, history: SiteTurn[], sent: string[]) =>
  post("/api/sites/preview", { config, history, sent }).then((r) => json<SiteAnswer>(r));
export const publishSite = (config: AssistantConfig) => post("/api/sites", { config }).then((r) => json<{ slug: string; ownerKey: string }>(r));
export const updateSite = (slug: string, key: string, config: AssistantConfig) => post(`/api/sites/${slug}`, { config }, key, "PUT").then((r) => json<{ slug: string }>(r));
export const unpublishSite = (slug: string, key: string) =>
  fetch(`${BASE}/api/sites/${slug}`, { method: "DELETE", headers: { "x-owner-key": key } }).then((r) => json<{ ok: true }>(r));
export const siteInbox = (slug: string, key: string) =>
  fetch(`${BASE}/api/sites/${slug}/inbox`, { headers: { "x-owner-key": key } }).then((r) => json<{ items: InboxItem[]; dailyLimit: number }>(r));
export const publicSite = (slug: string) => fetch(`${BASE}/api/sites/${slug}/public`).then((r) => json<PublicSite>(r));
export const chatSite = (slug: string, history: SiteTurn[], sent: string[]) =>
  post(`/api/sites/${slug}/chat`, { history, sent }).then((r) => json<SiteAnswer>(r));
