import { useEffect, useRef, useState } from "react";
import {
  NARRATION_SECTIONS,
  streamNarration,
  type Blueprint,
  type NarrationSection,
  type NarrationValue,
} from "../api";
import { narrationKey, useProject, type NarrationEntry } from "../state/ProjectContext";

export interface NarrationView {
  /** N-ATLAS's checked text for a section, if it has one. */
  value: <T extends NarrationValue>(section: NarrationSection) => T | undefined;
  /** Why N-ATLAS's text wasn't used (the engine's text is shown instead). */
  problem: (section: NarrationSection) => string | undefined;
  /** The section N-ATLAS is writing now, and what it has written so far. */
  writing: { section: NarrationSection; text: string } | null;
  running: boolean;
  error: string | null;
  done: number;
  total: number;
  failed: NarrationSection[];
  stop: () => void;
  /** Write the missing sections (or rewrite the given ones). */
  write: (sections?: NarrationSection[]) => void;
}

/**
 * N-ATLAS writes the build guide's sections in the project's language. Starts
 * by itself for anything not written yet; results are saved with the project
 * per language, so they're written once.
 */
export function useNarration(bp: Blueprint | null): NarrationView {
  const { state, dispatch } = useProject();
  const language = state.language;
  const key = bp ? narrationKey(bp) : "";
  const entries: Partial<Record<NarrationSection, NarrationEntry>> =
    (state.narration?.key === key ? state.narration.byLanguage[language] : undefined) ?? {};
  const applicable = NARRATION_SECTIONS.filter((s) => s !== "features" || (bp?.buildPlan?.features.length ?? 0) > 0);
  const missing = applicable.filter((s) => !entries[s]);

  const [writing, setWriting] = useState<NarrationView["writing"]>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The run in progress; only it may update the page (an aborted run's late events are ignored). */
  const abortRef = useRef<AbortController | null>(null);

  async function write(sections: NarrationSection[] = missing) {
    if (!bp?.buildPlan || !sections.length) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setError(null);
    const lang = language;
    try {
      await streamNarration(
        { blueprint: bp, language: lang, sections },
        (e) => {
          if (ctrl.signal.aborted) return;
          if (e.type === "start") setWriting({ section: e.section, text: "" });
          else if (e.type === "delta") setWriting((w) => (w && w.section === e.section ? { ...w, text: w.text + e.delta } : w));
          else if (e.type === "section") {
            dispatch({
              type: "setNarrationSection",
              key,
              language: lang,
              section: e.section,
              entry: { value: e.value, problem: e.problem, at: new Date().toISOString() },
            });
            setWriting(null);
          } else if (e.type === "error") setError(e.message);
        },
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setWriting(null);
        setRunning(false);
      }
    }
  }

  // Write whatever's missing when the guide opens (or its blueprint / language changes);
  // stop when it closes. After Stop or an error, the bar's button starts it again.
  useEffect(() => {
    if (bp?.buildPlan && missing.length) write(missing);
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, state.id]);

  return {
    value: <T extends NarrationValue>(s: NarrationSection) => entries[s]?.value as T | undefined,
    problem: (s) => entries[s]?.problem,
    writing,
    running,
    error,
    done: applicable.filter((s) => entries[s]?.value).length,
    total: applicable.length,
    failed: applicable.filter((s) => entries[s]?.problem),
    stop: () => {
      abortRef.current?.abort();
      abortRef.current = null;
      setRunning(false);
      setWriting(null);
    },
    write: (sections) => {
      const list = sections ?? missing;
      if (sections) dispatch({ type: "clearNarration", language, sections: list });
      write(list);
    },
  };
}
