import { useEffect, useState } from "react";
import {
  getImprovement,
  runSecurity,
  type Improvement,
  type SecurityRunResult,
} from "../api";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";

const CATEGORY_LABEL: Record<string, string> = {
  "prompt-injection": "Prompt Injection",
  "system-prompt-extraction": "System-Prompt Extraction",
  "instruction-manipulation": "Instruction Manipulation",
  "sensitive-information": "Sensitive Information",
  jailbreak: "Jailbreak / Safety Bypass",
  "data-leakage": "Data / Context Leakage",
};

export default function Improve() {
  const { state, dispatch } = useProject();
  const before = state.securityBaseline ?? state.securityResult;
  const [improvement, setImprovement] = useState<Improvement | null>(
    state.improvement,
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [after, setAfter] = useState<SecurityRunResult | null>(
    state.improvement ? state.securityResult : null,
  );
  const [error, setError] = useState<string | null>(null);

  const failures = before?.results.filter((r) => !r.passed) ?? [];
  const failedCategories = [...new Set(failures.map((f) => f.category))];

  // Fetch the suggested hardening as soon as we land here.
  useEffect(() => {
    if (!before || improvement) return;
    setLoading(true);
    getImprovement(state.systemPrompt, failedCategories)
      .then(setImprovement)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyAndRetest() {
    if (!improvement) return;
    setApplying(true);
    setError(null);
    try {
      dispatch({ type: "setSystemPrompt", systemPrompt: improvement.newPrompt });
      dispatch({ type: "setImprovement", improvement });
      const result = await runSecurity(improvement.newPrompt);
      dispatch({ type: "setSecurityResult", result });
      setAfter(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  if (!before) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          Run the security tests first, then come back to improve.
          <div className="mt-4">
            <Button onClick={() => dispatch({ type: "setStep", step: "secure" })}>
              ← Back to Security
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-ink">Improve your application</h1>
      <p className="mt-1 text-slate-500">
        Your app failed {failures.length} security test
        {failures.length === 1 ? "" : "s"}. Here's what to fix and the exact
        prompt change to apply.
      </p>

      {/* Issues */}
      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Issues found</h2>
        <ul className="mt-3 space-y-2">
          {failedCategories.map((c) => {
            const count = failures.filter((f) => f.category === c).length;
            return (
              <li key={c} className="flex items-center gap-2 text-sm">
                <Badge tone="red">{count}</Badge>
                <span className="font-medium text-slate-700">
                  {CATEGORY_LABEL[c] ?? c}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Suggested change */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Suggested improvement</h2>
        {loading && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Preparing a hardened system prompt…
          </div>
        )}
        {improvement && (
          <>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {improvement.changes.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-forge-600">+</span>
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Added to your system prompt
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-forge-200 bg-forge-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                {improvement.addedBlock}
              </pre>
            </div>
            <div className="mt-4">
              <Button onClick={applyAndRetest} disabled={applying || !!after}>
                {applying ? (
                  <>
                    <Spinner /> Applying & re-testing…
                  </>
                ) : after ? (
                  "Applied ✓"
                ) : (
                  "Apply change & re-test"
                )}
              </Button>
            </div>
          </>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>

      {/* Before / after */}
      {after && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Result</h2>
          <div className="mt-3 flex items-center justify-center gap-6">
            <ScoreBlock label="Before" score={before.summary.score} tone="red" />
            <div className="text-2xl text-slate-300">→</div>
            <ScoreBlock
              label="After"
              score={after.summary.score}
              tone={after.summary.score >= 80 ? "green" : "amber"}
            />
          </div>
          {after.summary.failed > 0 && (
            <p className="mt-3 text-center text-xs text-slate-500">
              {after.summary.failed} finding
              {after.summary.failed === 1 ? "" : "s"} remain. Some sophisticated
              attacks (e.g. smuggled injection) need application-layer input
              handling, not just prompt changes — a realistic, honest result.
            </p>
          )}
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "setStep", step: "secure" })}
        >
          ← Back to Security
        </Button>
        <Button
          onClick={() => dispatch({ type: "setStep", step: "export" })}
          variant={after ? "primary" : "secondary"}
        >
          Continue to Export →
        </Button>
      </div>
    </div>
  );
}

function ScoreBlock({
  label,
  score,
  tone,
}: {
  label: string;
  score: number;
  tone: "red" | "amber" | "green";
}) {
  const color =
    tone === "green"
      ? "text-forge-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-red-600";
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-5xl font-bold ${color}`}>{score}</div>
    </div>
  );
}
