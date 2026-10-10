import { useRef, useState } from "react";
import { streamSecurity, type SecurityResult, type SecurityRunResult } from "../api";
import { RunProgress, type LiveRun } from "../components/RunProgress";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, SeverityTag } from "../ui";
import { N_, useT } from "../i18n";

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

const CATEGORY_LABEL: Record<string, string> = {
  "prompt-injection": N_("Prompt Injection"),
  "system-prompt-extraction": N_("System-Prompt Extraction"),
  "instruction-manipulation": N_("Instruction Manipulation"),
  "sensitive-information": N_("Sensitive Information"),
  jailbreak: N_("Jailbreak / Safety Bypass"),
  "data-leakage": N_("Data / Context Leakage"),
};

function catLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c;
}

function scoreColor(s: number): string {
  return s >= 80 ? "text-forge-600" : s >= 50 ? "text-amber-600" : "text-red-600";
}

/** Summarise attacks completed so far (used when a run is stopped early). */
export function partialSecurityRun(results: SecurityResult[], startedAt: number): SecurityRunResult {
  const byCategory: Record<string, { total: number; passed: number }> = {};
  const bySeverity: Record<string, { total: number; passed: number }> = {};
  let wTotal = 0;
  let wPassed = 0;
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, passed: 0 };
    bySeverity[r.severity] ??= { total: 0, passed: 0 };
    byCategory[r.category].total += 1;
    bySeverity[r.severity].total += 1;
    wTotal += SEV_WEIGHT[r.severity];
    if (r.passed) {
      byCategory[r.category].passed += 1;
      bySeverity[r.severity].passed += 1;
      wPassed += SEV_WEIGHT[r.severity];
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.error).length;
  return {
    provider: "http",
    model: "n-atlas",
    isMock: false,
    partial: true,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed - errored,
      errored,
      score: wTotal ? Math.round((wPassed / wTotal) * 100) : 0,
      byCategory,
      bySeverity,
    },
    results,
  };
}

const QUICK_RUN = N_("Quick attack run");
const FULL_RUN = N_("Full attack run");

export default function Secure() {
  const { state, dispatch } = useProject();
  const t = useT();
  const run = state.securityResult;
  const [live, setLive] = useState<LiveRun<SecurityResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function attack(quick: boolean) {
    if (!state.systemPrompt || live) return;
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    const collected: SecurityResult[] = [];
    setLive({ label: quick ? QUICK_RUN : FULL_RUN, total: null, results: [], startedAt });
    try {
      const result =
        (await streamSecurity(
          { systemPrompt: state.systemPrompt, quick },
          (e) => {
            if (e.type === "start") setLive((l) => (l ? { ...l, total: e.total } : l));
            if (e.type === "case") {
              collected.push(e.result);
              setLive((l) => (l ? { ...l, total: e.total, results: [...collected] } : l));
            }
          },
          ctrl.signal,
        )) ?? (collected.length ? partialSecurityRun(collected, startedAt) : null);
      if (result) {
        dispatch({ type: "setSecurityResult", result });
        // The baseline is the first complete run, so Improve compares like with like.
        if (!state.securityBaseline && !result.partial) {
          dispatch({ type: "setSecurityBaseline", result });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (collected.length) {
        dispatch({ type: "setSecurityResult", result: partialSecurityRun(collected, startedAt) });
      }
    } finally {
      abortRef.current = null;
      setLive(null);
    }
  }

  const failedCount = run ? run.summary.failed : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("Attack Your Application")}</h1>
          <p className="mt-1 text-slate-500">
            {t("Before you deploy it, see how it responds to common AI attacks — prompt injection, system-prompt extraction, jailbreaks and more.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => attack(true)}
            disabled={!!live}
            title={t("The most severe attack from each category (6 tests)")}
          >
            {t("Quick run")}
          </Button>
          <Button onClick={() => attack(false)} disabled={!!live}>
            {run && !run.partial ? t("Re-run all attacks") : t("Run all attacks")}
          </Button>
        </div>
      </div>

      {live && <RunProgress run={live} onStop={() => abortRef.current?.abort()} />}
      {live && live.results.length > 0 && (
        <div className="mt-3 space-y-2">
          {[...live.results].reverse().map((r) => (
            <AttackRow key={r.id} r={r} />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {run && !live && <Report run={run} />}

      {run && !live && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: "setStep", step: "evaluate" })}
          >
            ← {t("Back")}
          </Button>
          {failedCount > 0 ? (
            <Button onClick={() => dispatch({ type: "setStep", step: "improve" })}>
              {failedCount > 1 ? t("Fix {n} issues →", { n: failedCount }) : t("Fix 1 issue →")}
            </Button>
          ) : (
            <Button onClick={() => dispatch({ type: "setStep", step: "export" })}>
              {t("Continue to Export →")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Report({ run }: { run: SecurityRunResult }) {
  const t = useT();
  const sorted = [...run.results].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1; // failures first
    return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
  });

  return (
    <div className="mt-6 space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-4xl font-bold ${scoreColor(run.summary.score)}`}>
              {run.summary.score}
            </div>
            <div className="text-sm text-slate-500">
              {t("Security score · {passed}/{total} attacks defended", { passed: run.summary.passed, total: run.summary.total })}
            </div>
            {run.partial && (
              <Badge tone="amber" className="mt-1">
                {t("Stopped early — partial result")}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {Object.entries(run.summary.bySeverity)
              .sort((a, b) => (SEV_ORDER[a[0]] ?? 9) - (SEV_ORDER[b[0]] ?? 9))
              .map(([sev, v]) => (
                <div key={sev} className="text-center">
                  <div className="text-xs uppercase text-slate-400">{t(sev)}</div>
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
  const t = useT();
  const [open, setOpen] = useState(!r.passed && r.severity !== "low");
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <Badge tone={r.passed ? "green" : "red"}>{r.passed ? t("PASS") : t("FAIL")}</Badge>
        <SeverityTag severity={r.severity} />
        <span className="text-sm font-medium text-slate-700">
          {t(catLabel(r.category))}
        </span>
        <span className="font-mono text-xs text-slate-400">{r.id}</span>
        <span className="ml-auto text-slate-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <Field label={t("Attack prompt")}>{r.prompt}</Field>
          <Field label={t("Model response")}>{r.error || r.response}</Field>
          <Field label={t("Expected behaviour")}>{t(r.expectedBehavior)}</Field>
          <div
            className={`rounded-md border p-2 ${
              r.passed
                ? "border-forge-200 bg-forge-50 text-forge-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <span className="font-semibold">
              {r.passed ? t("Why it passed:") : t("Why it failed:")}{" "}
            </span>
            {t(r.explanation)}
          </div>
          {!r.passed && (
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <span className="font-semibold text-slate-700">
                {t("Recommended mitigation:")}{" "}
              </span>
              <span className="text-slate-600">{t(r.mitigation)}</span>
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
