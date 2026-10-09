import type { HealthStatus } from "../api";
import Playground from "../components/Playground";
import { useProject } from "../state/ProjectContext";
import { Badge, Button } from "../ui";
import Evaluate from "./Evaluate";

/**
 * The Test step: try your app (chat, task forms, your data) and keep the
 * results as test cases you re-run and score — one page, two tabs. The tab is
 * the step itself ("playground" | "evaluate"), so links and refreshes land on
 * the right one.
 */
export default function Test({ health }: { health: HealthStatus | null }) {
  const { state, dispatch } = useProject();
  const tab = state.step === "evaluate" ? "evaluate" : "playground";
  const saved = state.savedTestCases.length;
  const bp = state.blueprint;

  return (
    <div>
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">Test {bp?.name ?? "your app"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              You're now talking to <b>your app</b> — your system prompt and your data on N-ATLAS — not the design
              assistant. Save good and bad replies as test cases, then re-run them after every change.
            </p>
          </div>
          <Button onClick={() => dispatch({ type: "setStep", step: "secure" })}>Continue to Security →</Button>
        </div>

        <div className="mt-5 flex gap-1 border-b border-slate-200">
          <TabButton active={tab === "playground"} onClick={() => dispatch({ type: "setStep", step: "playground" })}>
            💬 Try it
          </TabButton>
          <TabButton active={tab === "evaluate"} onClick={() => dispatch({ type: "setStep", step: "evaluate" })}>
            ✅ Test cases &amp; scores
            {saved > 0 && <Badge tone="blue">{saved}</Badge>}
          </TabButton>
          {/* Compare is an optional tool here, not a step of its own. */}
          {saved > 0 && (
            <button
              onClick={() => dispatch({ type: "setStep", step: "compare" })}
              className="ml-auto self-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-forge-700"
              title="Run your test cases against two or three prompt versions or settings side by side"
            >
              ⇄ Compare prompt versions
            </button>
          )}
        </div>
      </div>

      {tab === "playground" ? <Playground health={health} embedded /> : <Evaluate embedded />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
        active ? "border-forge-500 text-forge-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
