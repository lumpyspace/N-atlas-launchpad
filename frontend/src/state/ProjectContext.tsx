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
  Improvement,
  SecurityRunResult,
  SuiteRunResult,
} from "../api";

/**
 * Central state for the Launchpad wizard. One project lives here and flows
 * through every screen: Describe → Build → Try → Evaluate → Secure → Improve →
 * Export. Persisted to localStorage so a refresh doesn't lose work.
 */

export type Step =
  | "landing"
  | "describe"
  | "blueprint"
  | "playground"
  | "evaluate"
  | "compare"
  | "secure"
  | "improve"
  | "export";

export const STEPS: { key: Step; label: string }[] = [
  { key: "describe", label: "Describe" },
  { key: "blueprint", label: "Build" },
  { key: "playground", label: "Try" },
  { key: "evaluate", label: "Evaluate" },
  { key: "compare", label: "Compare" },
  { key: "secure", label: "Secure" },
  { key: "improve", label: "Improve" },
  { key: "export", label: "Export" },
];

export function stepIndex(step: Step): number {
  return STEPS.findIndex((s) => s.key === step);
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
}

export interface CompareState {
  variants: CompareVariant[];
  /** Keyed by `${caseId}::${variantId}`. */
  cells: Record<string, CaseResult>;
  summary: CompareSummary[] | null;
  partial: boolean;
  ranAt: string | null;
}

const initialState: ProjectState = {
  step: "landing",
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
    case "setPlaygroundData":
      return { ...state, playgroundData: action.data };
    case "patchBlueprint":
      return state.blueprint ? { ...state, blueprint: { ...state.blueprint, ...action.patch } } : state;
    case "reset":
      return { ...initialState };
    default:
      return state;
  }
}

const STORAGE_KEY = "natlas-launchpad-project-v2";

function load(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return { ...initialState, ...(JSON.parse(raw) as Partial<ProjectState>) };
  } catch {
    return initialState;
  }
}

interface ProjectContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<Action>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [state]);

  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
