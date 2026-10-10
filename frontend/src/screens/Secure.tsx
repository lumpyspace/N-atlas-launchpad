import { useEffect, useRef, useState } from "react";
import { getImprovement, streamSecurity, type SecurityResult, type SecurityRunResult } from "../api";
import { isHardened } from "../utils/prompt";
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

export function catLabel(c: string): string {
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

/** Runs the attacks against the current prompt and saves the result (Test → Security, and Ship's launch check). */
export function useSecurityRun() {
  const { state, dispatch } = useProject();
  const [live, setLive] = useState<LiveRun<SecurityResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function attack(quick: boolean) {
    if (!state.systemPrompt || abortRef.current) return;
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
      if (result && abortRef.current === ctrl) dispatch({ type: "setSecurityResult", result });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      // Keep what was collected when this run is still the current one (e.g. Stop) — not when the page closed.
      if (collected.length && abortRef.current === ctrl) {
        dispatch({ type: "setSecurityResult", result: partialSecurityRun(collected, startedAt) });
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setLive(null);
      }
    }
  }

  // Stop when the page closes. Clearing the ref lets a remount start a fresh run.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  return {
    live,
    error,
    attack,
    stop: () => abortRef.current?.abort(),
    /** The saved result is for an older version of the prompt. */
    stale: !!state.securityResult && state.securityPrompt !== undefined && state.securityPrompt !== state.systemPrompt,
  };
}

/**
 * Test → Security: controlled attacks on the app. Its prompt already has
 * security rules built in; this checks they hold, and that they're still there.
 */
export default function Secure({ embedded = false }: { embedded?: boolean }) {
  const { state, dispatch } = useProject();
  const t = useT();
  const run = state.securityResult;
  const { live, error, attack, stop, stale } = useSecurityRun();
  const [adding, setAdding] = useState(false);
  const hardened = isHardened(state.systemPrompt);

  async function addRulesBack() {
    setAdding(true);
    try {
      const { newPrompt } = await getImprovement(state.systemPrompt, []);
      dispatch({ type: "setSystemPrompt", systemPrompt: newPrompt });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={`mx-auto max-w-4xl px-6 ${embedded ? "py-4" : "py-10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-slate-500">
          {t("Your app's prompt has security rules built in. These controlled attacks check they hold — prompt injection, system-prompt extraction, jailbreaks and more.")}
        </p>
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

      {!hardened && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="flex-1">
            {t("Your prompt is missing its security rules — they were probably removed while editing. Without them, attacks get through far more often.")}
          </span>
          <Button size="sm" onClick={addRulesBack} disabled={adding}>
            {t("Add them back")}
          </Button>
        </div>
      )}
      {stale && !live && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {t("Your prompt has changed since these results — run the attacks again to check it.")}
        </div>
      )}

      {live && <RunProgress run={live} onStop={stop} />}
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

      <p className="mt-6 text-xs text-slate-400">
        {t("Your exported app adds checks in code too: a message length limit, a per-user rate limit, and blocking any reply that would leak the prompt.")}
      </p>
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
