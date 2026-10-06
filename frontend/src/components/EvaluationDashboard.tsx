import { useEffect, useState } from "react";
import {
  getSuites,
  runEvaluation,
  type CaseResult,
  type SuiteInfo,
  type SuiteRunResult,
} from "../api";

/**
 * Evaluation dashboard — pick a suite, run it against N-ATLAS, and view a
 * scored report: overall pass rate, per-category breakdown, and expandable
 * per-case results (prompt, output, failed checks).
 *
 * CPU inference is slow, so the UI makes the wait explicit and offers a
 * "max cases" cap for quick runs.
 */
export default function EvaluationDashboard() {
  const [suites, setSuites] = useState<SuiteInfo[]>([]);
  const [suite, setSuite] = useState<string>("");
  const [maxCases, setMaxCases] = useState<string>("");
  const [run, setRun] = useState<SuiteRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSuites()
      .then((r) => {
        setSuites(r.suites);
        setSuite(r.default || r.suites[0]?.name || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const selected = suites.find((s) => s.name === suite);

  async function onRun() {
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      const n = maxCases.trim() ? Number(maxCases) : undefined;
      setRun(await runEvaluation(suite, Number.isFinite(n) ? n : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold">Evaluation</h2>
      <p className="mb-4 text-sm text-slate-500">
        Run a suite of Nigerian-context test cases against N-ATLAS and score the
        results.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Suite</label>
          <select
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={suite}
            onChange={(e) => setSuite(e.target.value)}
          >
            {suites.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.cases} cases)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Max cases <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="number"
            min={1}
            placeholder="all"
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={maxCases}
            onChange={(e) => setMaxCases(e.target.value)}
          />
        </div>

        <button
          onClick={onRun}
          disabled={running || !suite}
          className="ml-auto rounded-lg bg-forge-500 px-4 py-2 text-sm font-semibold text-white hover:bg-forge-600 disabled:opacity-50"
        >
          {running ? "Running…" : "Run evaluation"}
        </button>
      </div>

      {selected && (
        <p className="mb-4 text-xs text-slate-400">{selected.description}</p>
      )}

      {running && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Running {maxCases.trim() ? `${maxCases} of ` : ""}
          {selected?.cases ?? ""} cases against N-ATLAS… CPU inference is slow
          (~5–15s per case), so this can take a few minutes. Hang tight.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {run && <RunReport run={run} />}
    </section>
  );
}

function RunReport({ run }: { run: SuiteRunResult }) {
  const pct = Math.round(run.summary.passRate * 100);
  const pctColor =
    pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <div>
      {run.isMock && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          ⚠ These results are from the MOCK provider — NOT a real N-ATLAS
          evaluation.
        </div>
      )}

      {/* Summary */}
      <div className="mb-4 flex flex-wrap items-center gap-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div>
          <div className={`text-3xl font-bold ${pctColor}`}>{pct}%</div>
          <div className="text-xs text-slate-500">pass rate</div>
        </div>
        <div className="text-sm text-slate-600">
          <div>
            <span className="font-semibold text-emerald-600">{run.summary.passed}</span>{" "}
            passed ·{" "}
            <span className="font-semibold text-red-600">{run.summary.failed}</span>{" "}
            failed
            {run.summary.errored > 0 && (
              <>
                {" "}·{" "}
                <span className="font-semibold text-red-700">
                  {run.summary.errored}
                </span>{" "}
                errored
              </>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {run.summary.total} cases · model {run.model} ·{" "}
            {(run.durationMs / 1000).toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Per-category bars */}
      <div className="mb-5 space-y-2">
        {Object.entries(run.summary.byCategory).map(([cat, v]) => {
          const p = v.total ? Math.round((v.passed / v.total) * 100) : 0;
          return (
            <div key={cat} className="flex items-center gap-3">
              <div className="w-28 text-sm text-slate-600">{cat}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-forge-500"
                  style={{ width: `${p}%` }}
                />
              </div>
              <div className="w-14 text-right text-xs text-slate-500">
                {v.passed}/{v.total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-case results */}
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
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
  const badge =
    status === "PASS"
      ? "bg-emerald-100 text-emerald-700"
      : status === "FAIL"
        ? "bg-red-100 text-red-700"
        : "bg-red-200 text-red-800";

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${badge}`}>{status}</span>
        <span className="font-mono text-sm text-slate-700">{c.caseId}</span>
        <span className="text-xs text-slate-400">{c.category}</span>
        {c.language && (
          <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">
            {c.language}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {Math.round(c.score * 100)}% · {(c.latencyMs / 1000).toFixed(1)}s
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-2 bg-slate-50 px-4 py-3 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Prompt</div>
            <div className="text-slate-700">{c.prompt}</div>
          </div>
          {c.error ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
              Error: {c.error}
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-400">Output</div>
              <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-slate-800">
                {c.output}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Checks</div>
            <ul className="space-y-1">
              {c.checks.map((chk, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={chk.passed ? "text-emerald-600" : "text-red-600"}>
                    {chk.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-slate-700">{chk.label}</span>
                  <span className="text-xs text-slate-400">— {chk.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
