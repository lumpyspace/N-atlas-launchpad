import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Blueprint,
  CaseResult,
  Check,
  CompareSummary,
  CompareVariant,
  DesignMessage,
  DesignSlot,
  DesignSnapshot,
  Improvement,
  SecurityRunResult,
  SuiteRunResult,
} from "../api";
import type { KDoc } from "../utils/knowledge";

/**
 * Workspace state: several projects, one open at a time. Screens use
 * useProject(), which reads and updates the open project only; useWorkspace()
 * manages the list (new, open, rename, duplicate, delete) and which view is
 * showing (landing page, My projects, or a project). Persisted to
 * localStorage so a refresh doesn't lose work.
 */

export type Step =
  | "landing"
  | "describe"
  | "blueprint"
  | "prompt"
  | "knowledge"
  | "playground"
  | "evaluate"
  | "compare"
  | "secure"
  | "improve"
  | "export";

export const STEPS: { key: Step; label: string }[] = [
  { key: "describe", label: "Design" },
  { key: "blueprint", label: "Build" },
  // One "Test" step: "playground" (try it) and "evaluate" (test cases & scores) are its two tabs.
  { key: "playground", label: "Test" },
  { key: "secure", label: "Secure" },
  { key: "improve", label: "Improve" },
  { key: "export", label: "Export" },
];

export function stepIndex(step: Step): number {
  // "evaluate" is the second tab of the Test step, and Compare is a tool opened from it.
  const key = step === "evaluate" || step === "compare" ? "playground" : step;
  return STEPS.findIndex((s) => s.key === key);
}

/** A single developer-saved test case from the Playground. */
export interface SavedTestCase {
  id: string;
  userMessage: string;
  assistantReply: string;
  language: string;
  verdict: "good" | "bad";
  note: string;
  expectedBehavior: string;
  savedAt: string;
  /** Assertions run against the reply. Missing on cases saved before checks existed. */
  checks?: Check[];
  /** "Your data" that was in the prompt when this case was saved; replayed on every run. */
  context?: string;
}

export interface ProjectState {
  step: Step;
  description: string;
  blueprint: Blueprint | null;
  systemPrompt: string;
  evalResult: SuiteRunResult | null;
  securityResult: SecurityRunResult | null;
  securityBaseline: SecurityRunResult | null;
  improvement: Improvement | null;
  /** Test cases saved from the Playground for developer review in Evaluate. */
  savedTestCases: SavedTestCase[];
  /** Latest run of only the developer's own test cases. */
  testRun: SuiteRunResult | null;
  /** Variants and results of the Compare grid. */
  compare: CompareState | null;
  /** The Playground's "Your data" panel (facts added to the system prompt). */
  playgroundData: string;
  /** The Design chat: conversation, the developer's answers, and the latest canvas. */
  design: DesignState;
  /** When the starter project was last downloaded. */
  exportedAt?: string;
  /** Saved versions of the system prompt, newest first. */
  promptVersions: PromptVersion[];
  /** The app's documents; relevant passages are added to each question. */
  knowledge: KDoc[];
}

export interface PromptVersion {
  id: string;
  savedAt: string;
  label: string;
  text: string;
}

/** A saved project in the workspace. */
export interface Project extends ProjectState {
  id: string;
  /** Name chosen by the developer; otherwise the blueprint's name is shown. */
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignState {
  messages: DesignMessage[];
  answers: Partial<Record<DesignSlot, string>>;
  /** Which slot the developer's next message answers. */
  pendingSlot: DesignSlot | "done";
  /** Kind of app chosen on the canvas, overriding detection. */
  useCase?: string;
  snapshot: DesignSnapshot | null;
}

export const EMPTY_DESIGN: DesignState = { messages: [], answers: {}, pendingSlot: "idea", snapshot: null };

export interface CompareState {
  variants: CompareVariant[];
  /** Keyed by `${caseId}::${variantId}`. */
  cells: Record<string, CaseResult>;
  summary: CompareSummary[] | null;
  partial: boolean;
  ranAt: string | null;
}

const initialState: ProjectState = {
  step: "describe",
  description: "",
  blueprint: null,
  systemPrompt: "",
  evalResult: null,
  securityResult: null,
  securityBaseline: null,
  improvement: null,
  savedTestCases: [],
  testRun: null,
  compare: null,
  playgroundData: "",
  design: EMPTY_DESIGN,
  promptVersions: [],
  knowledge: [],
};

type Action =
  | { type: "setStep"; step: Step }
  | { type: "setDescription"; description: string }
  | { type: "setBlueprint"; blueprint: Blueprint }
  | { type: "setSystemPrompt"; systemPrompt: string }
  | { type: "setEvalResult"; result: SuiteRunResult | null }
  | { type: "setSecurityResult"; result: SecurityRunResult | null }
  | { type: "setSecurityBaseline"; result: SecurityRunResult | null }
  | { type: "setImprovement"; improvement: Improvement | null }
  | { type: "addTestCase"; testCase: SavedTestCase }
  | { type: "removeTestCase"; id: string }
  | { type: "updateTestCase"; id: string; patch: Partial<SavedTestCase> }
  | { type: "importTestCases"; cases: SavedTestCase[] }
  | { type: "setTestRun"; result: SuiteRunResult | null }
  | { type: "setCompare"; compare: CompareState | null }
  | { type: "patchBlueprint"; patch: Partial<Blueprint> }
  | { type: "setPlaygroundData"; data: string }
  | { type: "setDesign"; design: DesignState }
  | { type: "markExported" }
  | { type: "savePromptVersion"; label: string }
  | { type: "deletePromptVersion"; id: string }
  | { type: "addKnowledge"; doc: KDoc }
  | { type: "removeKnowledge"; id: string }
  | { type: "reset" };

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case "setStep":
      return { ...state, step: action.step };
    case "setDescription":
      return { ...state, description: action.description };
    case "setBlueprint":
      return {
        ...state,
        blueprint: action.blueprint,
        systemPrompt: action.blueprint.systemPrompt,
        evalResult: null,
        securityResult: null,
        securityBaseline: null,
        improvement: null,
        testRun: null,
        compare: null,
        playgroundData: action.blueprint.buildPlan?.playground?.sampleData ?? "",
      };
    case "setSystemPrompt":
      return { ...state, systemPrompt: action.systemPrompt };
    case "setEvalResult":
      return { ...state, evalResult: action.result };
    case "setSecurityResult":
      return { ...state, securityResult: action.result };
    case "setSecurityBaseline":
      return { ...state, securityBaseline: action.result };
    case "setImprovement":
      return { ...state, improvement: action.improvement };
    case "addTestCase":
      return {
        ...state,
        savedTestCases: [...state.savedTestCases, action.testCase],
      };
    case "removeTestCase":
      return {
        ...state,
        savedTestCases: state.savedTestCases.filter((tc) => tc.id !== action.id),
      };
    case "updateTestCase":
      return {
        ...state,
        savedTestCases: state.savedTestCases.map((tc) =>
          tc.id === action.id ? { ...tc, ...action.patch } : tc,
        ),
      };
    case "importTestCases": {
      const existing = new Set(state.savedTestCases.map((tc) => tc.id));
      return {
        ...state,
        savedTestCases: [
          ...state.savedTestCases,
          ...action.cases.filter((tc) => !existing.has(tc.id)),
        ],
      };
    }
    case "setTestRun":
      return { ...state, testRun: action.result };
    case "setCompare":
      return { ...state, compare: action.compare };
    case "setDesign":
      return { ...state, design: action.design };
    case "setPlaygroundData":
      return { ...state, playgroundData: action.data };
    case "patchBlueprint":
      return state.blueprint ? { ...state, blueprint: { ...state.blueprint, ...action.patch } } : state;
    case "savePromptVersion": {
      const latest = state.promptVersions[0];
      if (latest && latest.text === state.systemPrompt) return state; // nothing changed
      const v: PromptVersion = {
        id: `v-${Date.now()}`,
        savedAt: new Date().toISOString(),
        label: action.label.trim() || `Version ${state.promptVersions.length + 1}`,
        text: state.systemPrompt,
      };
      return { ...state, promptVersions: [v, ...state.promptVersions].slice(0, 50) };
    }
    case "addKnowledge":
      return { ...state, knowledge: [...state.knowledge, action.doc] };
    case "removeKnowledge":
      return { ...state, knowledge: state.knowledge.filter((d) => d.id !== action.id) };
    case "deletePromptVersion":
      return { ...state, promptVersions: state.promptVersions.filter((v) => v.id !== action.id) };
    case "markExported":
      return { ...state, exportedAt: new Date().toISOString() };
    case "reset":
      return { ...initialState };
    default:
      return state;
  }
}

// ── Workspace (many projects) ────────────────────────────────────────────────

export type View = "landing" | "home" | "project";

export interface WorkspaceState {
  projects: Record<string, Project>;
  /** Most recently updated first. */
  order: string[];
  currentId: string | null;
  view: View;
}

type WorkspaceAction =
  | { type: "project"; action: Action }
  | { type: "newProject" }
  | { type: "openProject"; id: string }
  | { type: "renameProject"; id: string; title: string }
  | { type: "duplicateProject"; id: string }
  | { type: "deleteProject"; id: string }
  | { type: "setView"; view: View };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeProject(from: Partial<ProjectState> = {}): Project {
  const now = new Date().toISOString();
  return { ...initialState, ...from, id: newId(), createdAt: now, updatedAt: now };
}

function touch(ws: WorkspaceState, p: Project): WorkspaceState {
  return {
    ...ws,
    projects: { ...ws.projects, [p.id]: p },
    order: [p.id, ...ws.order.filter((id) => id !== p.id)],
  };
}

function workspaceReducer(ws: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "project": {
      const current = ws.currentId ? ws.projects[ws.currentId] : null;
      // Older screens navigate "home" with setStep("landing").
      if (action.action.type === "setStep" && action.action.step === "landing") {
        return { ...ws, view: ws.order.length ? "home" : "landing" };
      }
      if (!current) return ws;
      if (action.action.type === "reset") return workspaceReducer(ws, { type: "newProject" });
      const next = reducer(current, action.action);
      if (next === current) return ws;
      // Moving between tabs isn't an edit; don't reorder the project list for it.
      const updatedAt = action.action.type === "setStep" ? current.updatedAt : new Date().toISOString();
      const project = { ...current, ...next, updatedAt };
      return action.action.type === "setStep"
        ? { ...ws, projects: { ...ws.projects, [project.id]: project } }
        : touch(ws, project);
    }
    case "newProject": {
      const p = makeProject();
      return { ...touch(ws, p), currentId: p.id, view: "project" };
    }
    case "openProject":
      return ws.projects[action.id] ? { ...ws, currentId: action.id, view: "project" } : ws;
    case "renameProject": {
      const p = ws.projects[action.id];
      return p ? touch(ws, { ...p, title: action.title.trim() || undefined, updatedAt: new Date().toISOString() }) : ws;
    }
    case "duplicateProject": {
      const src = ws.projects[action.id];
      if (!src) return ws;
      const copy = makeProject({ ...src });
      copy.title = `${projectName(src)} (copy)`;
      return touch(ws, copy);
    }
    case "deleteProject": {
      const projects = { ...ws.projects };
      delete projects[action.id];
      const order = ws.order.filter((id) => id !== action.id);
      const currentId = ws.currentId === action.id ? null : ws.currentId;
      return { ...ws, projects, order, currentId, view: currentId ? ws.view : order.length ? "home" : "landing" };
    }
    case "setView":
      return { ...ws, view: action.view };
  }
}

/** Display name: the developer's title, else the blueprint's or design's name. */
export function projectName(p: ProjectState & { title?: string }): string {
  return p.title || p.blueprint?.name || designPreview(p)?.blueprint.name || "Untitled project";
}

/** The Design chat's live preview — only once the developer has described an idea. */
export function designPreview(p: ProjectState) {
  return p.design.answers.idea ? p.design.snapshot : null;
}

/** The kind of app ("Notes & study assistant"), once known. */
export function projectKind(p: ProjectState): string | undefined {
  return p.blueprint?.buildPlan?.useCase?.label ?? designPreview(p)?.blueprint.buildPlan?.useCase?.label;
}

const STORAGE_KEY = "natlas-launchpad-workspace-v1";
/** The single-project store used before workspaces; imported once, never deleted. */
const LEGACY_KEY = "natlas-launchpad-project-v2";

const EMPTY_WORKSPACE: WorkspaceState = { projects: {}, order: [], currentId: null, view: "landing" };

function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ws = JSON.parse(raw) as WorkspaceState;
      // Fill fields added after a project was saved.
      for (const id of Object.keys(ws.projects)) {
        ws.projects[id] = { ...initialState, ...ws.projects[id] };
      }
      return { ...EMPTY_WORKSPACE, ...ws };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Partial<ProjectState>;
      if (old.blueprint || old.description || old.design?.messages?.length) {
        const p = makeProject({ ...old, step: old.step === "landing" || !old.step ? "describe" : old.step });
        return { projects: { [p.id]: p }, order: [p.id], currentId: null, view: "home" };
      }
    }
  } catch {
    /* corrupt or unavailable storage — start fresh */
  }
  return EMPTY_WORKSPACE;
}

interface ProjectContextValue {
  state: Project;
  dispatch: (action: Action) => void;
}

interface WorkspaceContextValue {
  workspace: WorkspaceState;
  current: Project | null;
  newProject: () => void;
  openProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  setView: (view: View) => void;
  /** Update the open project (same actions screens use). */
  dispatchProject: (action: Action) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, loadWorkspace);

  // Save shortly after changes settle (typing fires many updates).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [workspace]);

  const value: WorkspaceContextValue = {
    workspace,
    current: workspace.currentId ? workspace.projects[workspace.currentId] ?? null : null,
    newProject: () => dispatch({ type: "newProject" }),
    openProject: (id) => dispatch({ type: "openProject", id }),
    renameProject: (id, title) => dispatch({ type: "renameProject", id, title }),
    duplicateProject: (id) => dispatch({ type: "duplicateProject", id }),
    deleteProject: (id) => dispatch({ type: "deleteProject", id }),
    setView: (view) => dispatch({ type: "setView", view }),
    dispatchProject: (action) => dispatch({ type: "project", action }),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a ProjectProvider");
  return ctx;
}

/** The open project. Only used inside the project workspace, where one is open. */
export function useProject(): ProjectContextValue {
  const { current, dispatchProject } = useWorkspace();
  if (!current) throw new Error("useProject needs an open project");
  return { state: current, dispatch: dispatchProject };
}
