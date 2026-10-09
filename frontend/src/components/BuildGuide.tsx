import { useEffect, useState } from "react";
import { getUseCases, type BuildPlan, type UseCaseOption } from "../api";
import { useProject, type Step } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";

type Plan = BuildPlan;

const NODE_STYLE: Record<Plan["architecture"][number]["kind"], string> = {
  user: "border-slate-300 bg-white",
  yours: "border-blue-200 bg-blue-50",
  natlas: "border-forge-300 bg-forge-50",
  optional: "border-amber-200 bg-amber-50",
};

const NODE_TAG: Record<Plan["architecture"][number]["kind"], string> = {
  user: "User",
  yours: "You build",
  natlas: "N-ATLAS",
  optional: "You connect",
};

const APPROACH_TONE: Record<Plan["features"][number]["approach"], "green" | "blue" | "amber" | "slate" | "red"> = {
  prompt: "green",
  retrieval: "blue",
  lookup: "amber",
  compute: "slate",
  schedule: "slate",
  vision: "red",
  speech: "blue",
};

const SOURCE_KIND: Record<Plan["dataSources"][number]["kind"], string> = {
  documents: "Official documents",
  "live-data": "Live data",
  "your-content": "Your content",
};

const STEP_LINK: Record<string, { step: Step; label: string }> = {
  playground: { step: "playground", label: "Open the Playground" },
  evaluate: { step: "evaluate", label: "Open Evaluate" },
  compare: { step: "compare", label: "Open Compare" },
  secure: { step: "secure", label: "Open Security tests" },
  export: { step: "export", label: "Open Export" },
};

/** "How to build it": a plan specific to this app idea. */
export function BuildGuide({
  plan,
  appName,
  onChangeUseCase,
}: {
  plan: Plan;
  appName: string;
  /** Rebuild the blueprint for a different kind of app. */
  onChangeUseCase: (id: string) => Promise<void>;
}) {
  const { dispatch } = useProject();
  const go = (step: Step) => dispatch({ type: "setStep", step });

  return (
    <div className="space-y-6">
      {/* What you're building */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900">What you're building</h2>
          {plan.useCase.label.split(" + ").map((l) => (
            <Badge key={l} tone="green">
              {l}
            </Badge>
          ))}
          <Badge>{plan.channel.label}</Badge>
          {plan.voice.needed && <Badge tone="blue">Voice input</Badge>}
        </div>
        <p className="mt-2 text-sm text-slate-600">{plan.useCase.summary}</p>
        <UseCasePicker current={plan.useCase.ids[0]} onChange={onChangeUseCase} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              How it should feel
            </div>
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="ml-8 rounded-lg rounded-br-sm bg-forge-500 px-3 py-2 text-white">
                {plan.conversation.user}
              </div>
              <div className="mr-8 rounded-lg rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-slate-700">
                <div className="mb-0.5 text-[10px] font-semibold uppercase text-forge-600">{appName}</div>
                {plan.conversation.app}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Illustrative — “…” marks facts your app fills in from its data.
            </p>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Start with this first version
            </div>
            <Bullets items={plan.mvp} />
          </div>
        </div>
      </Card>

      {/* Architecture */}
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
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{NODE_TAG[n.kind]}</div>
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

      {/* Features */}
      {plan.features.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900">Feature by feature</h2>
          <p className="mt-1 text-sm text-slate-500">
            Not everything should be left to the model. Here's the right technique for each feature of {appName}.
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            {plan.features.map((f) => (
              <div key={f.task} className="grid gap-1 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">{f.task}</div>
                  <Badge tone={APPROACH_TONE[f.approach]} className="mt-1">
                    {f.approachLabel}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">{f.how}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Data sources */}
      {plan.dataSources.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900">Where your facts must come from</h2>
          <p className="mt-1 text-sm text-slate-500">
            N-ATLAS doesn't know these — collect them before launch and feed the relevant parts into each answer.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {plan.dataSources.map((d) => (
              <div key={d.name} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{d.name}</div>
                  <Badge tone={d.kind === "live-data" ? "amber" : d.kind === "documents" ? "blue" : "slate"}>
                    {SOURCE_KIND[d.kind]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{d.why}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Steps */}
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
                        onClick={() => go(STEP_LINK[s.launchpadStep!].step)}
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

      {/* Risks */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Mistakes to avoid in this kind of app
          </h3>
          <Bullets items={plan.pitfalls} />
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">N-ATLAS limits to plan for</h3>
          <Bullets items={plan.watchOut} />
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-forge-600">Where N-ATLAS fits well</h3>
          <Bullets items={plan.goodFit} />
        </Card>
      </div>

      {/* Success */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">How you'll know it works</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Measure</div>
            <Bullets items={plan.metrics} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Test with messages like</div>
            <ul className="space-y-1.5">
              {plan.testMessages.map((m) => (
                <li key={m} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700">
                  {m}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => go("playground")}>
              Try them in the Playground →
            </Button>
          </div>
        </div>
      </Card>

      {/* Licence */}
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
  const long = code.split("\n").length > 16;
  const [expanded, setExpanded] = useState(!long);
  return (
    <div className="relative mt-2">
      <pre
        className={`overflow-x-auto rounded-lg bg-slate-900 p-3 pr-16 text-[12px] leading-relaxed text-slate-100 ${
          expanded ? "" : "max-h-64 overflow-y-hidden"
        }`}
      >
        <code>{code}</code>
      </pre>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-slate-900 to-transparent pb-2 pt-8 text-xs font-medium text-slate-200 hover:text-white"
        >
          Show all {code.split("\n").length} lines ▾
        </button>
      )}
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

/** "Not the right kind of app?" — lets the developer correct the detection. */
function UseCasePicker({ current, onChange }: { current: string; onChange: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UseCaseOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !options.length) getUseCases().then(setOptions).catch(() => {});
  }, [open, options.length]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-forge-600 hover:underline">
        Not the right kind of app? Change it
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-600">What kind of app is this?</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            title={o.summary}
            disabled={busy || o.id === current}
            onClick={async () => {
              setBusy(true);
              try {
                await onChange(o.id);
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              o.id === current
                ? "border-forge-500 bg-forge-50 font-semibold text-forge-700"
                : "border-slate-300 bg-white text-slate-700 hover:border-forge-400"
            } disabled:cursor-default`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Picking one rebuilds the blueprint, features and system prompt for that kind of app. Your saved test cases are kept.
        {" "}
        <button onClick={() => setOpen(false)} className="underline">
          Cancel
        </button>
      </p>
    </div>
  );
}
