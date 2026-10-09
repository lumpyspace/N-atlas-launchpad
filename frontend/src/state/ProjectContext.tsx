import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Blueprint,
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
  | "secure"
  | "improve"
  | "export";

export const STEPS: { key: Step; label: string }[] = [
  { key: "describe", label: "Describe" },
  { key: "blueprint", label: "Build" },
  { key: "playground", label: "Try" },
  { key: "evaluate", label: "Evaluate" },
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
