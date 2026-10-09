import { useEffect, useRef, useState } from "react";
import {
  getModels,
  streamCompare,
  type CaseResult,
  type CompareVariant,
  type LangCode,
  type ModelOption,
} from "../api";
import { RunProgress, type LiveRun } from "../components/RunProgress";
import { useProject, type CompareState, type SavedTestCase } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";
import { checksFor, checkLabel, LANG_LABEL, toCaseInput } from "../utils/testCases";

const MAX_VARIANTS = 3;
const cellKey = (caseId: string, variantId: string) => `${caseId}::${variantId}`;

function defaultVariants(systemPrompt: string, hardened?: string): CompareVariant[] {
  return [
    { id: "v1", label: "Current prompt", modelId: "natlas", systemPrompt, temperature: 0.2 },
    hardened
      ? { id: "v2", label: "Hardened prompt", modelId: "natlas", systemPrompt: hardened, temperature: 0.2 }
      : { id: "v2", label: "Higher temperature", modelId: "natlas", systemPrompt, temperature: 0.7 },
  ];
}

export default function Compare() {
  const { state, dispatch } = useProject();
  const cases = state.savedTestCases;
  const saved = state.compare;
  const [variants, setVariants] = useState<CompareVariant[]>(
    saved?.variants ?? defaultVariants(state.systemPrompt, state.improvement?.newPrompt),
  );
  const [models, setModels] = useState<ModelOption[]>([{ id: "natlas", label: "N-ATLAS", model: "n-atlas" }]);
  const [live, setLive] = useState<LiveRun<CaseResult> | null>(null);
  const [cells, setCells] = useState<Record<string, CaseResult>>(saved?.cells ?? {});
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
  }, []);

  const update = (id: string, patch: Partial<CompareVariant>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  function addVariant() {
    const n = Math.max(0, ...variants.map((v) => Number(v.id.slice(1)) || 0)) + 1;
    setVariants((vs) => [
      ...vs,
      { id: `v${n}`, label: `Variant ${n}`, modelId: "natlas", systemPrompt: state.systemPrompt, temperature: 0.2 },
    ]);
  }

  async function run() {
    if (live || cases.length === 0) return;
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    const collected: CaseResult[] = [];
    const nextCells: Record<string, CaseResult> = {};
    setCells({});
    setLive({ label: "Comparing variants", total: cases.length * variants.length, results: [], startedAt });

    let summary: CompareState["summary"] = null;
    let partial = true;
    try {
      await streamCompare(
        { variants, cases: cases.map(toCaseInput) },
        (e) => {
          if (e.type === "cell") {
            collected.push(e.result);
            nextCells[cellKey(e.caseId, e.variantId)] = e.result;
            setCells({ ...nextCells });
            setLive((l) => (l ? { ...l, results: [...collected] } : l));
          } else if (e.type === "done") {
            summary = e.summary;
            partial = e.partial;
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      abortRef.current = null;
      setLive(null);
      dispatch({
        type: "setCompare",
        compare: { variants, cells: nextCells, summary, partial, ranAt: new Date().toISOString() },
      });
    }
  }

  // Per-variant score from whatever cells exist (works for partial runs too).
  const scores = variants.map((v) => {
    const rs = cases.map((tc) => cells[cellKey(tc.id, v.id)]).filter((r): r is CaseResult => !!r);
    const passed = rs.filter((r) => r.passed).length;
    const avg = rs.length ? rs.reduce((s, r) => s + r.latencyMs, 0) / rs.length : 0;
    return { id: v.id, ran: rs.length, passed, avgMs: avg };
  });
  const best = scores.reduce<(typeof scores)[number] | null>(
    (b, s) => (s.ran && (!b || s.passed / s.ran > b.passed / b.ran) ? s : b),
    null,
  );
  const hasResults = Object.keys(cells).length > 0;
  const calls = cases.length * variants.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Compare variants</h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            Run the same test cases against different system prompts, temperatures or models, side by side —
            then keep the winner. Every cell is scored with the test's own checks.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => dispatch({ type: "setStep", step: "evaluate" })}>
            ← Back to Test
          </Button>
        </div>
      </div>

      {cases.length === 0 ? (
        <Card className="mt-6 p-8 text-center text-sm text-slate-500">
          Compare needs test cases. Save replies in <b>Test → Try it</b>, or import a suite in <b>Test cases &amp; scores</b>.
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "setStep", step: "playground" })}>
              Go to Try it
            </Button>
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "setStep", step: "evaluate" })}>
              Go to Test cases
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className={`mt-6 grid gap-4 ${variants.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
            {variants.map((v, i) => (
              <VariantEditor
                key={v.id}
                v={v}
                index={i}
                models={models}
                disabled={!!live}
                canRemove={variants.length > 2}
                onChange={(patch) => update(v.id, patch)}
                onRemove={() => setVariants((vs) => vs.filter((x) => x.id !== v.id))}
                onUseCurrent={() => update(v.id, { systemPrompt: state.systemPrompt })}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {cases.length} test{cases.length === 1 ? "" : "s"} × {variants.length} variants ={" "}
              <b>{calls} model calls</b>
              {calls > 6 && " — on a laptop CPU this can take a while; try a GPU endpoint for big grids."}
            </div>
            <div className="flex gap-2">
              {variants.length < MAX_VARIANTS && (
                <Button variant="ghost" onClick={addVariant} disabled={!!live}>
                  + Add variant
                </Button>
              )}
              <Button onClick={run} disabled={!!live}>
                ▶ {hasResults ? "Re-run comparison" : "Run comparison"}
              </Button>
            </div>
          </div>

          {live && <RunProgress run={live} onStop={() => abortRef.current?.abort()} />}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {saved?.partial && !live && hasResults && (
            <div className="mt-4">
              <Badge tone="amber">Stopped early — some cells were not run</Badge>
            </div>
          )}

          {(hasResults || live) && (
            <Grid
              cases={cases}
              variants={variants}
              cells={cells}
              scores={scores}
              bestId={hasResults && scores.filter((s) => s.ran).length > 1 ? best?.id : undefined}
              onAdopt={(v) => {
                dispatch({ type: "setSystemPrompt", systemPrompt: v.systemPrompt });
              }}
              currentPrompt={state.systemPrompt}
            />
          )}
        </>
      )}
    </div>
  );
}

function VariantEditor({
  v,
  index,
  models,
  disabled,
  canRemove,
  onChange,
  onRemove,
  onUseCurrent,
}: {
  v: CompareVariant;
  index: number;
  models: ModelOption[];
  disabled: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<CompareVariant>) => void;
  onRemove: () => void;
  onUseCurrent: () => void;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forge-100 text-xs font-bold text-forge-700">
          {String.fromCharCode(65 + index)}
        </span>
        <input
          value={v.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-transparent px-1 py-0.5 font-semibold text-slate-800 hover:border-slate-200 focus:border-forge-500 focus:outline-none"
          aria-label="Variant name"
        />
        {canRemove && (
          <button onClick={onRemove} disabled={disabled} className="text-xs text-slate-400 hover:text-red-600">
            Remove
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1 text-slate-500">
          Model
          <select
            value={v.modelId}
            onChange={(e) => onChange({ modelId: e.target.value })}
            disabled={disabled}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-500">
          Temperature: {v.temperature.toFixed(1)}
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={v.temperature}
            onChange={(e) => onChange({ temperature: Number(e.target.value) })}
            disabled={disabled}
            className="accent-forge-500"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        System prompt
        <button onClick={onUseCurrent} disabled={disabled} className="text-forge-600 hover:underline">
          Reset to current
        </button>
      </div>
      <textarea
        value={v.systemPrompt}
        onChange={(e) => onChange({ systemPrompt: e.target.value })}
        disabled={disabled}
        className="mt-1 h-40 w-full flex-1 resize-y rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-800 focus:border-forge-500 focus:outline-none"
      />
    </Card>
  );
}

function Grid({
  cases,
  variants,
  cells,
  scores,
  bestId,
  onAdopt,
  currentPrompt,
}: {
  cases: SavedTestCase[];
  variants: CompareVariant[];
  cells: Record<string, CaseResult>;
  scores: { id: string; ran: number; passed: number; avgMs: number }[];
  bestId?: string;
  onAdopt: (v: CompareVariant) => void;
  currentPrompt: string;
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
      <table className="w-full min-w-[640px] table-fixed text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="w-64 px-3 py-3 font-semibold text-slate-600">Test case</th>
            {variants.map((v, i) => {
              const s = scores.find((x) => x.id === v.id)!;
              const pct = s.ran ? Math.round((s.passed / s.ran) * 100) : null;
              const adopted = v.systemPrompt === currentPrompt;
              return (
                <th key={v.id} className="px-3 py-3 align-top">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span className="text-forge-600">{String.fromCharCode(65 + i)}</span> {v.label}
                    {bestId === v.id && <Badge tone="green">Best</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs font-normal text-slate-500">
                    {pct === null ? "not run" : `${s.passed}/${s.ran} passing (${pct}%)`}
                    {s.ran > 0 && ` · avg ${(s.avgMs / 1000).toFixed(1)}s`}
                  </div>
                  <button
                    onClick={() => onAdopt(v)}
                    disabled={adopted}
                    className="mt-1 text-xs font-medium text-forge-600 hover:underline disabled:text-slate-400 disabled:no-underline"
                  >
                    {adopted ? "Same prompt as your app" : "Use this prompt in my app"}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {cases.map((tc) => (
            <tr key={tc.id} className="border-b border-slate-100 align-top last:border-0">
              <td className="px-3 py-3">
                <div className="line-clamp-3 text-slate-700">{tc.userMessage}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tc.language && <Badge tone="blue">{LANG_LABEL[tc.language as LangCode] ?? tc.language}</Badge>}
                  <span className="text-[11px] text-slate-400" title={checksFor(tc).map(checkLabel).join("\n")}>
                    {checksFor(tc).length} checks
                  </span>
                </div>
              </td>
              {variants.map((v) => (
                <Cell key={v.id} r={cells[cellKey(tc.id, v.id)]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ r }: { r?: CaseResult }) {
  const [open, setOpen] = useState(false);
  if (!r) return <td className="px-3 py-3 text-xs text-slate-300">—</td>;
  const ok = r.passed && !r.error;
  return (
    <td className={`px-3 py-3 ${ok ? "bg-forge-50/40" : "bg-red-50/40"}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-center gap-2">
          <Badge tone={ok ? "green" : "red"}>{r.error ? "ERROR" : ok ? "PASS" : "FAIL"}</Badge>
          <span className="text-xs text-slate-400">{(r.latencyMs / 1000).toFixed(1)}s</span>
        </div>
        <div className={`mt-1.5 whitespace-pre-wrap text-xs text-slate-600 ${open ? "" : "line-clamp-4"}`}>
          {r.error || r.output}
        </div>
      </button>
      {open && (
        <ul className="mt-2 space-y-0.5 text-[11px]">
          {r.checks.map((c, i) => (
            <li key={i} className={c.passed ? "text-forge-700" : "text-red-700"}>
              {c.passed ? "✓" : "✗"} {c.label} <span className="text-slate-400">— {c.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {!open && r.checks.some((c) => !c.passed) && (
        <div className="mt-1 text-[11px] text-red-700">
          ✗ {r.checks.filter((c) => !c.passed).map((c) => c.label).join(", ")}
        </div>
      )}
    </td>
  );
}
