import { useState } from "react";
import { runAppEvaluation, type CaseResult, type SuiteRunResult } from "../api";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";

const CATEGORY_LABEL: Record<string, string> = {
  quality: "AI Quality",
  context: "Nigerian Context",
  language: "Language",
  reliability: "Reliability",
  safety: "Safety",
  translation: "Translation",
  factual: "Factual",
};

function label(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat;
}

function scoreColor(pct: number): string {
  return pct >= 80 ? "text-forge-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
}

export default function Evaluate() {
  const { state, dispatch } = useProject();
  const bp = state.blueprint;
  const run = state.evalResult;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function evaluate() {
    if (!bp) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runAppEvaluation(bp.sector, state.systemPrompt);
      dispatch({ type: "setEvalResult", result });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          Describe your app first to generate an evaluation suite.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Launchpad Evaluation</h1>
          <p className="mt-1 text-slate-500">
            Scores your app on AI quality, Nigerian context, language and
            reliability. Not an official N-ATLAS score.
          </p>
        </div>
        <Button onClick={evaluate} disabled={running}>
          {running ? (
            <>
              <Spinner /> Running…
            </>
          ) : run ? (
            "Re-run evaluation"
          ) : (
            "Evaluate application"
          )}
        </Button>
      </div>

      {running && (
        <Card className="mt-6 p-4 text-sm text-slate-500">
          Running the evaluation suite… live N-ATLAS inference can take a while per
          case; demo mode is near-instant.
        </Card>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {run && !running && <Report run={run} />}

      {run && !running && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: "setStep", step: "playground" })}
          >
            ← Back
          </Button>
          <Button onClick={() => dispatch({ type: "setStep", step: "secure" })}>
            Continue to Security →
          </Button>
        </div>
      )}
    </div>
  );
}

function Report({ run }: { run: SuiteRunResult }) {
  const pct = Math.round(run.summary.passRate * 100);
  return (
    <div className="mt-6 space-y-4">
      {run.isMock && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Demo mode — scored against scripted responses, not real N-ATLAS. The
          scoring engine ran for real.
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-4xl font-bold ${scoreColor(pct)}`}>{pct}</div>
            <div className="text-sm text-slate-500">
              {run.summary.passed} passed · {run.summary.failed} failed
              {run.summary.errored > 0 && ` · ${run.summary.errored} errored`}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            {run.summary.total} cases · {label(run.model)} ·{" "}
            {(run.durationMs / 1000).toFixed(1)}s
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {Object.entries(run.summary.byCategory).map(([cat, v]) => {
            const cpct = v.total ? Math.round((v.passed / v.total) * 100) : 0;
            return (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-36 shrink-0 text-sm text-slate-600">
                  {label(cat)}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-forge-500"
                    style={{ width: `${cpct}%` }}
                  />
                </div>
                <div className="w-14 text-right text-xs text-slate-400">
                  {v.passed}/{v.total}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-2">
        {run.cases.map((c) => (
          <CaseRow key={c.caseId} c={c} />
        ))}
      </div>
    </div>
  );
}

function CaseRow({ c }: { c: CaseResult }) {
  const [open, setOpen] = useState(false);
  const status = c.error ? "ERROR" : c.passed ? "PASS" : "FAIL";
  const tone = c.error ? "red" : c.passed ? "green" : "red";
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <Badge tone={tone as "green" | "red"}>{status}</Badge>
        <span className="font-mono text-xs text-slate-400">{c.caseId}</span>
        <Badge>{label(c.category)}</Badge>
        {c.language && <Badge tone="blue">{c.language}</Badge>}
        <span className="ml-auto text-xs text-slate-400">
          {Math.round(c.score * 100)}% · {c.latencyMs}ms
        </span>
        <span className="text-slate-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <Field label="Prompt">{c.prompt}</Field>
          <Field label={c.error ? "Error" : "Response"}>
            {c.error || c.output}
          </Field>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Checks
            </div>
            <ul className="space-y-1">
              {c.checks.map((ck, i) => (
                <li key={i} className="flex gap-2">
                  <span className={ck.passed ? "text-forge-600" : "text-red-600"}>
                    {ck.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-slate-600">
                    {ck.label}
                    <span className="text-slate-400"> — {ck.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-slate-700">
        {children}
      </div>
    </div>
  );
}
