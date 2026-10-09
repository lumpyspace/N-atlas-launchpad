import { useState } from "react";
import type { BuildPlan } from "../api";
import { useProject, type Step } from "../state/ProjectContext";
import { Badge, Card } from "../ui";

const NODE_STYLE: Record<BuildPlan["architecture"][number]["kind"], string> = {
  user: "border-slate-300 bg-white",
  yours: "border-blue-200 bg-blue-50",
  natlas: "border-forge-300 bg-forge-50",
  optional: "border-amber-200 bg-amber-50",
};

const NODE_TAG: Record<BuildPlan["architecture"][number]["kind"], string> = {
  user: "User",
  yours: "You build",
  natlas: "N-ATLAS",
  optional: "You connect",
};

const STEP_LINK: Record<string, { step: Step; label: string }> = {
  playground: { step: "playground", label: "Open the Playground" },
  evaluate: { step: "evaluate", label: "Open Evaluate" },
  compare: { step: "compare", label: "Open Compare" },
  secure: { step: "secure", label: "Open Security tests" },
  export: { step: "export", label: "Open Export" },
};

/** "How to build it": architecture, ordered steps, fit and licence for this idea. */
export function BuildGuide({ plan }: { plan: BuildPlan }) {
  const { dispatch } = useProject();

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">How your app fits together</h2>
        <p className="mt-1 text-sm text-slate-500">
          {plan.channel.why}
          {plan.voice.needed && " It also takes voice input, so speech recognition comes first."}
        </p>
        <div className="mt-4 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          {plan.architecture.map((n, i) => (
            <div key={n.label} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
              <div className={`w-full rounded-lg border p-3 ${NODE_STYLE[n.kind]}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {NODE_TAG[n.kind]}
                </div>
                <div className="text-sm font-semibold text-slate-800">{n.label}</div>
                <div className="mt-0.5 text-xs text-slate-500">{n.detail}</div>
              </div>
              {i < plan.architecture.length - 1 && (
                <span className="text-slate-300 md:shrink-0" aria-hidden>
                  <span className="md:hidden">↓</span>
                  <span className="hidden md:inline">→</span>
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The reply travels back the same way. Only your backend talks to N-ATLAS, so your system prompt
          {plan.knowledge.needed ? ", data" : ""} and keys stay private.
        </p>
      </Card>

      <div>
        <h2 className="font-semibold text-slate-900">Build it, step by step</h2>
        <ol className="mt-3 space-y-3">
          {plan.steps.map((s, i) => (
            <li key={s.title}>
              <Card className="p-4">
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forge-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{s.title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.detail}</p>
                    {s.code && <CodeBlock code={s.code} />}
                    {s.launchpadStep && STEP_LINK[s.launchpadStep] && (
                      <button
                        onClick={() => dispatch({ type: "setStep", step: STEP_LINK[s.launchpadStep!].step })}
                        className="mt-2 text-sm font-medium text-forge-600 hover:underline"
                      >
                        {STEP_LINK[s.launchpadStep].label} →
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-600">
            Where N-ATLAS fits well
          </h3>
          <Bullets items={plan.goodFit} />
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Watch out for
          </h3>
          <Bullets items={plan.watchOut} />
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Licence &amp; attribution</h3>
          <Badge>Check before launch</Badge>
        </div>
        <Bullets items={plan.license} />
        <p className="mt-2 text-xs text-slate-400">
          Summary of the model card — read the full{" "}
          <a
            href="https://huggingface.co/NCAIR1/N-ATLaS"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-600"
          >
            N-ATLaS Terms of Use
          </a>{" "}
          before deploying.
        </p>
      </Card>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
      {items.map((it) => (
        <li key={it} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 pr-16 text-[12px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked; the code is still selectable */
          }
        }}
        className="absolute right-2 top-2 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}
