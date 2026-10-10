import { useRef, useState } from "react";
import {
  streamAppEvaluation,
  type CaseResult,
  type Check,
  type LangCode,
  type SuiteRunResult,
} from "../api";
import { RunProgress, type LiveRun } from "../components/RunProgress";
import { useProject, type SavedTestCase } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";
import {
  buildCheck,
  CHECK_KINDS,
  checkLabel,
  checksFor,
  fromSuiteFile,
  LANG_LABEL,
  toCaseInput,
  toSuiteFile,
} from "../utils/testCases";
import { N_, plural, useT } from "../i18n";

const CATEGORY_LABEL: Record<string, string> = {
  custom: N_("Your Tests"),
  "app-specific": N_("Your App"),
  quality: N_("AI Quality"),
  context: N_("Nigerian Context"),
  language: N_("Language"),
  reliability: N_("Reliability"),
  safety: N_("Safety"),
  translation: N_("Translation"),
  factual: N_("Factual"),
};

function label(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat;
}

function scoreColor(pct: number): string {
  return pct >= 80 ? "text-forge-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
}

type RunKind = "custom" | "quick" | "full";

const RUN_LABEL: Record<RunKind, string> = {
  custom: N_("Running your tests"),
  quick: N_("Quick evaluation"),
  full: N_("Full evaluation"),
};

/** Summarise results collected so far (used when a run is stopped early). */
function partialRun(results: CaseResult[], startedAt: number, suite: string): SuiteRunResult {
  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.error).length;
  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, passed: 0 };
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
  }
  return {
    suite,
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
      passRate: results.length ? passed / results.length : 0,
      byCategory,
    },
    cases: results,
  };
}

export default function Evaluate({ embedded = false }: { embedded?: boolean }) {
  const { state, dispatch } = useProject();
  const t = useT();
  const bp = state.blueprint;
  const run = state.evalResult;
  const savedCases = state.savedTestCases;
  const [live, setLive] = useState<(LiveRun<CaseResult> & { kind: RunKind }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start(kind: RunKind) {
    if (!bp || live) return;
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    const collected: CaseResult[] = [];
    setLive({ kind, label: RUN_LABEL[kind], total: null, results: [], startedAt });

    try {
      const result = await streamAppEvaluation(
        {
          sector: bp.sector,
          systemPrompt: state.systemPrompt,
          description: state.description,
          customCases: savedCases.map(toCaseInput),
          scope: kind === "custom" ? "custom" : "all",
          quick: kind === "quick",
        },
        (e) => {
          if (e.type === "start") setLive((l) => (l ? { ...l, total: e.total } : l));
          if (e.type === "case") {
            collected.push(e.result);
            setLive((l) => (l ? { ...l, total: e.total, results: [...collected] } : l));
          }
        },
        ctrl.signal,
      );
      const final = result ?? (collected.length ? partialRun(collected, startedAt, kind) : null);
      if (final) {
        dispatch({ type: kind === "custom" ? "setTestRun" : "setEvalResult", result: final });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (collected.length) {
        dispatch({
          type: kind === "custom" ? "setTestRun" : "setEvalResult",
          result: partialRun(collected, startedAt, kind),
        });
      }
    } finally {
      abortRef.current = null;
      setLive(null);
    }
  }

  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          {t("Describe your app first to generate an evaluation suite.")}
        </Card>
      </div>
    );
  }

  // Latest result per developer test case, from whichever run is newer.
  const latest = new Map<string, CaseResult>();
  const runs = [run, state.testRun]
    .filter((r): r is SuiteRunResult => !!r)
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  for (const r of runs) for (const c of r.cases) if (c.category === "custom") latest.set(c.caseId, c);

  return (
    <div className={`mx-auto max-w-4xl px-6 ${embedded ? "py-4" : "py-10"}`}>
      {embedded ? (
        <p className="text-sm text-slate-500">
          {t(
            "Re-run your test cases after every prompt change, then score the app on AI quality, Nigerian context, language and reliability. Not an official N-ATLAS score.",
          )}
        </p>
      ) : (
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("Evaluate")}</h1>
          <p className="mt-1 text-slate-500">
            {t(
              "Re-run your test cases after every prompt change, then score the app on AI quality, Nigerian context, language and reliability. Not an official N-ATLAS score.",
            )}
          </p>
        </div>
      )}

      <TestSuitePanel
        cases={savedCases}
        latest={latest}
        running={!!live}
        onRun={() => start("custom")}
        systemPrompt={state.systemPrompt}
        appName={bp.name}
        dispatch={dispatch}
      />

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">{t("Full evaluation")}</h2>
            <p className="text-sm text-slate-500">
              {t("Built-in Nigerian test suite for this kind of app ({sector})", { sector: t(bp.sector) })}
              {savedCases.length > 0 && ", " + plural(t, savedCases.length, "plus your {n} test", "plus your {n} tests")}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => start("quick")} disabled={!!live} title={t("About 6 built-in cases across every category")}>
              {t("Quick run")}
            </Button>
            <Button onClick={() => start("full")} disabled={!!live}>
              {run && !run.partial ? t("Re-run full evaluation") : t("Run full evaluation")}
            </Button>
          </div>
        </div>
      </Card>

      {live && <RunProgress run={live} onStop={() => abortRef.current?.abort()} />}

      {live && live.results.length > 0 && (
        <div className="mt-3 space-y-2">
          {[...live.results].reverse().map((c) => (
            <CaseRow key={c.caseId} c={c} />
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
            onClick={() => dispatch({ type: "setStep", step: "playground" })}
          >
            ← {t("Try it")}
          </Button>
          <Button onClick={() => dispatch({ type: "setStep", step: "secure" })}>
            {t("Continue to Security →")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Report({ run }: { run: SuiteRunResult }) {
  const t = useT();
  const pct = Math.round(run.summary.passRate * 100);
  return (
    <div className="mt-6 space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-4xl font-bold ${scoreColor(pct)}`}>{pct}</div>
            <div className="text-sm text-slate-500">
              {t("{passed} passed · {failed} failed", { passed: run.summary.passed, failed: run.summary.failed })}
              {run.summary.errored > 0 && " · " + t("{n} errored", { n: run.summary.errored })}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            {run.partial && (
              <Badge tone="amber" className="mb-1">
                {t("Stopped early — partial result")}
              </Badge>
            )}
            <div>
              {t("{n} cases", { n: run.summary.total })} · {run.model} · {(run.durationMs / 1000).toFixed(1)}s
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {Object.entries(run.summary.byCategory).map(([cat, v]) => {
            const cpct = v.total ? Math.round((v.passed / v.total) * 100) : 0;
            return (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-36 shrink-0 text-sm text-slate-600">{t(label(cat))}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-forge-500" style={{ width: `${cpct}%` }} />
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = c.error ? t("ERROR") : c.passed ? t("PASS") : t("FAIL");
  const tone = c.passed && !c.error ? "green" : "red";
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <Badge tone={tone}>{status}</Badge>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {c.description || c.caseId}
        </span>
        <Badge>{t(label(c.category))}</Badge>
        {c.language && <Badge tone="blue">{c.language}</Badge>}
        <span className="text-xs text-slate-400">{(c.latencyMs / 1000).toFixed(1)}s</span>
        <span className="text-slate-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
          <Field label={t("Prompt")}>{c.prompt}</Field>
          <Field label={c.error ? t("Error") : t("Response")}>{c.error || c.output}</Field>
          <CheckList checks={c.checks} />
        </div>
      )}
    </Card>
  );
}

function CheckList({ checks }: { checks: CaseResult["checks"] }) {
  const t = useT();
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Checks")}</div>
      <ul className="space-y-1">
        {checks.map((ck, i) => (
          <li key={i} className="flex gap-2">
            <span className={ck.passed ? "text-forge-600" : "text-red-600"}>{ck.passed ? "✓" : "✗"}</span>
            <span className="text-slate-600">
              {ck.label}
              <span className="text-slate-400"> — {ck.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-slate-700">
        {children}
      </div>
    </div>
  );
}

// ── Your test cases ──────────────────────────────────────────────────────────

type Dispatch = ReturnType<typeof useProject>["dispatch"];

function TestSuitePanel({
  cases,
  latest,
  running,
  onRun,
  systemPrompt,
  appName,
  dispatch,
}: {
  cases: SavedTestCase[];
  latest: Map<string, CaseResult>;
  running: boolean;
  onRun: () => void;
  systemPrompt: string;
  appName: string;
  dispatch: Dispatch;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const results = cases.map((tc) => latest.get(tc.id)).filter((r): r is CaseResult => !!r);
  const passing = results.filter((r) => r.passed).length;

  function exportSuite() {
    const file = toSuiteFile(appName, cases, systemPrompt);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.tests.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importSuite(file: File) {
    try {
      const imported = fromSuiteFile(await file.text());
      dispatch({ type: "importTestCases", cases: imported });
      setImportMsg(plural(t, imported.length, "Imported {n} test.", "Imported {n} tests."));
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">
            {t("Your test cases")}
            {cases.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                {t("{n} saved", { n: cases.length })}
                {results.length > 0 && " · " + t("{passed}/{total} passing on last run", { passed: passing, total: results.length })}
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500">
            {t("Re-run these after every prompt change to catch regressions. Each test passes only if all of its checks pass.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            {t("Import")}
          </Button>
          <Button variant="ghost" size="sm" onClick={exportSuite} disabled={!cases.length}>
            {t("Export")}
          </Button>
          <Button size="sm" onClick={onRun} disabled={running || !cases.length}>
            ▶ {t("Run my tests")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSuite(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {importMsg && <div className="mt-2 text-xs text-slate-500">{importMsg}</div>}

      {cases.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("No test cases yet. In the Try it tab, rate a reply with 👍 or 👎 to save it as a test case, or import a .tests.json file.")}
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "setStep", step: "playground" })}>
              ← {t("Go to Try it")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {cases.map((tc) => (
            <TestCaseRow key={tc.id} tc={tc} result={latest.get(tc.id)} dispatch={dispatch} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TestCaseRow({
  tc,
  result,
  dispatch,
}: {
  tc: SavedTestCase;
  result?: CaseResult;
  dispatch: Dispatch;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const checks = checksFor(tc);
  const setChecks = (next: Check[]) => dispatch({ type: "updateTestCase", id: tc.id, patch: { checks: next } });

  const status = !result ? null : result.error ? "ERROR" : result.passed ? "PASS" : "FAIL";
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        {status ? (
          <Badge tone={status === "PASS" ? "green" : "red"}>{t(status)}</Badge>
        ) : (
          <Badge>{t("NOT RUN")}</Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-slate-700">{tc.userMessage || t("(no prompt)")}</span>
        {tc.language && <Badge tone="blue">{LANG_LABEL[tc.language as LangCode] ?? tc.language}</Badge>}
        <span className="text-xs text-slate-400">
          {plural(t, checks.length, "{n} check", "{n} checks")}
        </span>
        <span className="text-slate-300">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 text-sm">
          <Field label={t("Prompt")}>{tc.userMessage}</Field>
          {(tc.note || tc.expectedBehavior) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {tc.note && <Field label={t("Note")}>{tc.note}</Field>}
              {tc.expectedBehavior && <Field label={t("Expected")}>{tc.expectedBehavior}</Field>}
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Checks")}</div>
            <div className="flex flex-wrap gap-1.5">
              {checks.map((c, i) => {
                const outcome = result?.checks[i];
                return (
                  <span
                    key={i}
                    title={outcome?.detail}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      !outcome
                        ? "border-slate-200 bg-white text-slate-600"
                        : outcome.passed
                          ? "border-forge-200 bg-forge-50 text-forge-700"
                          : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {outcome && (outcome.passed ? "✓" : "✗")} {checkLabel(c)}
                    <button
                      onClick={() => setChecks(checks.filter((_, j) => j !== i))}
                      className="ml-0.5 text-slate-400 hover:text-red-600"
                      aria-label={t("Remove check")}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
            <AddCheck lang={(tc.language as LangCode) || "en"} onAdd={(c) => setChecks([...checks, c])} />
          </div>

          {result && (
            <Field label={t("Last reply ({s}s)", { s: (result.latencyMs / 1000).toFixed(1) })}>
              {result.error || result.output}
            </Field>
          )}
          {!result && tc.assistantReply && <Field label={t("Reply when saved")}>{tc.assistantReply}</Field>}

          <button
            onClick={() => dispatch({ type: "removeTestCase", id: tc.id })}
            className="text-xs text-red-400 hover:text-red-600"
          >
            {t("Delete test case")}
          </button>
        </div>
      )}
    </div>
  );
}

function AddCheck({ lang, onAdd }: { lang: LangCode; onAdd: (c: Check) => void }) {
  const t = useT();
  const [type, setType] = useState<Check["type"]>("containsAny");
  const [value, setValue] = useState("");
  const [checkLang, setCheckLang] = useState<LangCode>(lang);
  const kind = CHECK_KINDS.find((k) => k.type === type)!;
  const check = buildCheck(type, value, checkLang);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as Check["type"])}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        {CHECK_KINDS.map((k) => (
          <option key={k.type} value={k.type}>
            {t(k.label)}
          </option>
        ))}
      </select>
      {kind.needs === "lang" && (
        <select
          value={checkLang}
          onChange={(e) => setCheckLang(e.target.value as LangCode)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          {(Object.keys(LANG_LABEL) as LangCode[]).map((l) => (
            <option key={l} value={l}>
              {t(LANG_LABEL[l])}
            </option>
          ))}
        </select>
      )}
      {(kind.needs === "values" || kind.needs === "number" || kind.needs === "pattern") && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            kind.needs === "number" ? t("e.g. 10") : kind.needs === "pattern" ? t("e.g. \\bextension officer\\b") : t("e.g. Bt, Spinosad")
          }
          className="min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
        />
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={!check}
        onClick={() => {
          if (check) onAdd(check);
          setValue("");
        }}
      >
        + {t("Add check")}
      </Button>
      <span className="w-full text-[11px] text-slate-400">{t(kind.hint)}</span>
    </div>
  );
}
