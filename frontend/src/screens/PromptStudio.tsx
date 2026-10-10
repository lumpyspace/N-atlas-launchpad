import { useEffect, useMemo, useState } from "react";
import { diagnosePrompt, type PromptDiagnosis, type PromptFinding } from "../api";
import { useProject, type PromptVersion } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";
import { diffLines } from "../utils/diff";
import { applyFix } from "../utils/prompt";
import { timeAgo } from "../utils/projectStatus";

const SEVERITY: Record<PromptFinding["severity"], { icon: string; box: string; text: string }> = {
  fix: { icon: "!", box: "border-red-200 bg-red-50", text: "text-red-700" },
  warn: { icon: "!", box: "border-amber-200 bg-amber-50", text: "text-amber-700" },
  info: { icon: "i", box: "border-blue-200 bg-blue-50", text: "text-blue-700" },
  good: { icon: "✓", box: "border-forge-200 bg-forge-50", text: "text-forge-700" },
};

/**
 * Prompt studio: the system prompt N-ATLAS follows for every reply, with a
 * prompt doctor (N-ATLAS-specific checks and one-click fixes), a context
 * budget meter, and saved versions you can compare and restore.
 */
export default function PromptStudio() {
  const { state, dispatch } = useProject();
  const bp = state.blueprint;
  const [diagnosis, setDiagnosis] = useState<PromptDiagnosis | null>(null);
  const [checking, setChecking] = useState(false);
  const [replyTokens, setReplyTokens] = useState(512);
  const [label, setLabel] = useState("");
  const [comparing, setComparing] = useState<PromptVersion | "generated" | null>(null);
  const [showGood, setShowGood] = useState(false);

  const prompt = state.systemPrompt;
  const setPrompt = (systemPrompt: string) => dispatch({ type: "setSystemPrompt", systemPrompt });

  // Re-check as the developer types (debounced; the doctor is instant server-side).
  useEffect(() => {
    const ctrl = new AbortController();
    setChecking(true);
    const t = setTimeout(() => {
      diagnosePrompt(
        {
          systemPrompt: prompt,
          data: state.playgroundData,
          languages: bp?.languages,
          needsKnowledge: !!bp?.buildPlan?.knowledge?.needed,
          maxTokens: replyTokens,
        },
        ctrl.signal,
      )
        .then(setDiagnosis)
        .catch(() => {})
        .finally(() => setChecking(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [prompt, state.playgroundData, replyTokens, bp]);

  const latest = state.promptVersions[0];
  const unsaved = !latest || latest.text !== prompt;
  const editedFromGenerated = !!bp && bp.systemPrompt !== prompt;

  const findings = diagnosis?.findings ?? [];
  const problems = findings.filter((f) => f.severity !== "good");
  const good = findings.filter((f) => f.severity === "good");
  const fixable = problems.filter((f) => f.fix);

  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">Design and build your app first — then refine its prompt here.</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Prompt studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The instructions N-ATLAS follows for every reply. The doctor checks them for N-ATLAS's known quirks; save
            versions as you go so you can compare and roll back.
          </p>
        </div>
        <Button onClick={() => dispatch({ type: "setStep", step: "playground" })}>Test it →</Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Editor + versions */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800">System prompt</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {diagnosis && (
                  <span>
                    ~{diagnosis.budget.systemPrompt.toLocaleString("en-US")} tokens · {diagnosis.words} words
                  </span>
                )}
                {unsaved ? <Badge tone="amber">Unsaved changes</Badge> : <Badge tone="green">Saved as “{latest!.label}”</Badge>}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              spellCheck={false}
              className="h-[26rem] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 focus:border-forge-500 focus:outline-none focus:ring-2 focus:ring-forge-500/20"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && unsaved) {
                    dispatch({ type: "savePromptVersion", label });
                    setLabel("");
                  }
                }}
                placeholder="Version name (optional), e.g. “added Pidgin rule”"
                className="min-w-56 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-forge-500 focus:outline-none"
              />
              <Button
                size="sm"
                disabled={!unsaved}
                onClick={() => {
                  dispatch({ type: "savePromptVersion", label });
                  setLabel("");
                }}
              >
                Save version
              </Button>
              {editedFromGenerated && (
                <Button size="sm" variant="ghost" onClick={() => setComparing("generated")}>
                  Compare with original
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-slate-800">Versions</h2>
            {state.promptVersions.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                No saved versions yet. Save one before a big change — then compare test results and roll back if it
                gets worse.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {state.promptVersions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="font-medium text-slate-700">{v.label}</span>
                    <span className="text-xs text-slate-400">{timeAgo(v.savedAt)}</span>
                    {v.text === prompt && <Badge tone="green">current</Badge>}
                    <span className="ml-auto flex gap-2 text-xs">
                      {v.text !== prompt && (
                        <>
                          <button onClick={() => setComparing(v)} className="text-forge-600 hover:underline">
                            Compare
                          </button>
                          <button onClick={() => setPrompt(v.text)} className="text-slate-500 hover:text-slate-800">
                            Restore
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => dispatch({ type: "deletePromptVersion", id: v.id })}
                        className="text-slate-300 hover:text-red-600"
                        aria-label="Delete version"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {comparing && (
            <DiffCard
              title={comparing === "generated" ? "Original (generated)" : comparing.label}
              before={comparing === "generated" ? bp.systemPrompt : comparing.text}
              after={prompt}
              onClose={() => setComparing(null)}
              onRestore={() => {
                setPrompt(comparing === "generated" ? bp.systemPrompt : comparing.text);
                setComparing(null);
              }}
            />
          )}
        </div>

        {/* Budget + doctor */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Context budget</h2>
              <select
                value={replyTokens}
                onChange={(e) => setReplyTokens(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                title="How long a reply you allow (max tokens)"
              >
                {[150, 256, 512, 1024].map((n) => (
                  <option key={n} value={n}>
                    replies up to {n}
                  </option>
                ))}
              </select>
            </div>
            {diagnosis ? <BudgetBar budget={diagnosis.budget} /> : <div className="mt-3 h-3 rounded-full bg-slate-100" />}
            <p className="mt-2 text-[11px] text-slate-400">
              Estimate for one exchange: prompt + your data + a typical message + the reply, against N-ATLAS's ~
              {(diagnosis?.budget.limit ?? 8092).toLocaleString("en-US")}-token window. Conversation history uses more.
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Prompt doctor</h2>
              {checking && <Spinner className="h-3 w-3 text-slate-400" />}
            </div>
            {diagnosis && (
              <p className="mt-0.5 text-xs text-slate-500">
                {problems.length === 0
                  ? "No issues found."
                  : `${problems.filter((f) => f.severity === "fix").length} to fix · ${problems.filter((f) => f.severity === "warn").length} to consider · ${problems.filter((f) => f.severity === "info").length} tips`}
              </p>
            )}
            {fixable.length > 1 && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => setPrompt(fixable.reduce((p, f) => applyFix(p, f.fix!.line), prompt))}
              >
                Apply all {fixable.length} fixes
              </Button>
            )}

            <div className="mt-3 space-y-2">
              {problems.map((f) => (
                <FindingRow
                  key={f.id}
                  f={f}
                  onFix={() => setPrompt(applyFix(prompt, f.fix!.line))}
                  onAction={() => dispatch({ type: "setStep", step: "secure" })}
                />
              ))}
            </div>

            {good.length > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowGood((s) => !s)} className="text-xs font-medium text-forge-700 hover:underline">
                  ✓ {good.length} thing{good.length === 1 ? "" : "s"} already good {showGood ? "▾" : "▸"}
                </button>
                {showGood && (
                  <div className="mt-2 space-y-2">
                    {good.map((f) => (
                      <FindingRow key={f.id} f={f} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function FindingRow({ f, onFix, onAction }: { f: PromptFinding; onFix?: () => void; onAction?: () => void }) {
  const s = SEVERITY[f.severity];
  return (
    <div className={`rounded-lg border p-2.5 ${s.box}`}>
      <div className="flex gap-2">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${s.text} border-current`}>
          {s.icon}
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-medium ${s.text}`}>{f.title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{f.detail}</p>
          {f.fix && onFix && (
            <div className="mt-1.5">
              <button
                onClick={onFix}
                className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:border-forge-400 hover:text-forge-700"
                title={f.fix.line}
              >
                + {f.fix.label}
              </button>
            </div>
          )}
          {f.action === "secure" && onAction && (
            <button onClick={onAction} className="mt-1.5 text-xs font-medium text-forge-700 hover:underline">
              Run security tests →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetBar({ budget }: { budget: PromptDiagnosis["budget"] }) {
  const parts = [
    { label: "System prompt", value: budget.systemPrompt, color: "bg-forge-500" },
    { label: "Your data", value: budget.data, color: "bg-blue-400" },
    { label: "Message", value: budget.message, color: "bg-slate-400" },
    { label: "Reply", value: budget.reply, color: "bg-amber-400" },
  ];
  const scale = Math.max(budget.total, budget.limit);
  const over = budget.total > budget.limit;
  return (
    <div className="mt-3">
      <div className="relative flex h-3 overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) =>
          p.value > 0 ? (
            <div key={p.label} className={p.color} style={{ width: `${(p.value / scale) * 100}%` }} title={`${p.label}: ~${p.value}`} />
          ) : null,
        )}
        {over && (
          <div className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: `${(budget.limit / scale) * 100}%` }} title="Context limit" />
        )}
      </div>
      <div className={`mt-1 text-sm font-semibold ${over ? "text-red-600" : budget.share > 0.75 ? "text-amber-600" : "text-slate-700"}`}>
        ~{budget.total.toLocaleString("en-US")} of {budget.limit.toLocaleString("en-US")} tokens ({Math.round(budget.share * 100)}%)
      </div>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${p.color}`} />
            {p.label}: ~{p.value.toLocaleString("en-US")}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiffCard({
  title,
  before,
  after,
  onClose,
  onRestore,
}: {
  title: string;
  before: string;
  after: string;
  onClose: () => void;
  onRestore: () => void;
}) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">
          Changes from “{title}” to now
          <span className="ml-2 text-xs font-normal">
            <span className="text-forge-700">+{added}</span> <span className="text-red-600">−{removed}</span>
          </span>
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onRestore}>
            Restore “{title}”
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white text-[12px] leading-relaxed">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.kind === "added"
                ? "bg-forge-50 px-3 text-forge-800"
                : l.kind === "removed"
                  ? "bg-red-50 px-3 text-red-700 line-through decoration-red-300"
                  : "px-3 text-slate-500"
            }
          >
            {l.kind === "added" ? "+ " : l.kind === "removed" ? "− " : "  "}
            {l.text || " "}
          </div>
        ))}
      </pre>
    </Card>
  );
}
