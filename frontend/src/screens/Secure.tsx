import { useState } from "react";
import { runSecurity, type SecurityResult, type SecurityRunResult } from "../api";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, SeverityTag, Spinner } from "../ui";

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const CATEGORY_LABEL: Record<string, string> = {
  "prompt-injection": "Prompt Injection",
  "system-prompt-extraction": "System-Prompt Extraction",
  "instruction-manipulation": "Instruction Manipulation",
  "sensitive-information": "Sensitive Information",
  jailbreak: "Jailbreak / Safety Bypass",
  "data-leakage": "Data / Context Leakage",
};

function catLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c;
}

function scoreColor(s: number): string {
  return s >= 80 ? "text-forge-600" : s >= 50 ? "text-amber-600" : "text-red-600";
}

export default function Secure() {
  const { state, dispatch } = useProject();
  const run = state.securityResult;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attack() {
    if (!state.systemPrompt) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runSecurity(state.systemPrompt);
      dispatch({ type: "setSecurityResult", result });
      if (!state.securityBaseline) {
        dispatch({ type: "setSecurityBaseline", result });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const failedCount = run ? run.summary.failed : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Attack Your Application</h1>
          <p className="mt-1 text-slate-500">
            Before you deploy it, see how it responds to common AI attacks —
            prompt injection, system-prompt extraction, jailbreaks and more.
          </p>
        </div>
        <Button onClick={attack} disabled={running}>
          {running ? (
            <>
              <Spinner /> Attacking…
            </>
          ) : run ? (
            "Re-run attacks"
          ) : (
            "Run security tests"
          )}
        </Button>
      </div>

      {running && (
        <Card className="mt-6 p-4 text-sm text-slate-500">
          Running {15} controlled attacks against your app… live inference can be
          slow; demo mode is near-instant.
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
            onClick={() => dispatch({ type: "setStep", step: "evaluate" })}
          >
            ← Back
          </Button>
          {failedCount > 0 ? (
            <Button onClick={() => dispatch({ type: "setStep", step: "improve" })}>
              Fix {failedCount} issue{failedCount > 1 ? "s" : ""} →
            </Button>
          ) : (
            <Button onClick={() => dispatch({ type: "setStep", step: "export" })}>
              Continue to Export →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Report({ run }: { run: SecurityRunResult }) {
  const sorted = [...run.results].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1; // failures first
    return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
  });

  return (
    <div className="mt-6 space-y-4">
      {run.isMock && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Demo mode — attacks were run against scripted responses, not real
          N-ATLAS. The detection engine ran for real.
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-4xl font-bold ${scoreColor(run.summary.score)}`}>
              {run.summary.score}
            </div>
            <div className="text-sm text-slate-500">
              Security score · {run.summary.passed}/{run.summary.total} attacks
              defended
            </div>
          </div>
          <div className="flex gap-2">
            {Object.entries(run.summary.bySeverity)
              .sort((a, b) => (SEV_ORDER[a[0]] ?? 9) - (SEV_ORDER[b[0]] ?? 9))
              .map(([sev, v]) => (
                <div key={sev} className="text-center">
                  <div className="text-xs uppercase text-slate-400">{sev}</div>
                  <div className="text-sm font-semibold text-slate-700">
                    {v.passed}/{v.total}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {sorted.map((r) => (
          <AttackRow key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}

function AttackRow({ r }: { r: SecurityResult }) {
  const [open, setOpen] = useState(!r.passed && r.severity !== "low");
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "PASS" : "FAIL"}</Badge>
        <SeverityTag severity={r.severity} />
        <span className="text-sm font-medium text-slate-700">
          {catLabel(r.category)}
        </span>
        <span className="font-mono text-xs text-slate-400">{r.id}</span>
        <span className="ml-auto text-slate-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <Field label="Attack prompt">{r.prompt}</Field>
          <Field label="Model response">{r.error || r.response}</Field>
          <Field label="Expected behaviour">{r.expectedBehavior}</Field>
          <div
            className={`rounded-md border p-2 ${
              r.passed
                ? "border-forge-200 bg-forge-50 text-forge-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <span className="font-semibold">
              {r.passed ? "Why it passed: " : "Why it failed: "}
            </span>
            {r.explanation}
          </div>
          {!r.passed && (
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <span className="font-semibold text-slate-700">
                Recommended mitigation:{" "}
              </span>
              <span className="text-slate-600">{r.mitigation}</span>
            </div>
          )}
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
