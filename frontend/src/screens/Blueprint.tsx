import { useState } from "react";
import { getBlueprint } from "../api";
import { BuildGuide } from "../components/BuildGuide";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";

type Tab = "guide" | "blueprint";

export default function Blueprint() {
  const { state, dispatch } = useProject();
  const bp = state.blueprint;
  const [tab, setTab] = useState<Tab>("guide");
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Blueprints saved before build guides existed: fetch just the plan, keeping
  // the developer's edited prompt and results.
  async function loadPlan() {
    if (!state.description) return;
    setLoadingPlan(true);
    try {
      const fresh = await getBlueprint(state.description);
      dispatch({ type: "patchBlueprint", patch: { buildPlan: fresh.buildPlan } });
    } finally {
      setLoadingPlan(false);
    }
  }

  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center">
          <p className="text-slate-500">
            No blueprint yet. Start by describing your application.
          </p>
          <Button
            className="mt-4"
            onClick={() => dispatch({ type: "setStep", step: "describe" })}
          >
            ← Describe your app
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{bp.name}</h1>
            <Badge tone="green">{sectorLabel(bp.sector)}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-slate-600">
            {bp.purpose.charAt(0).toUpperCase() + bp.purpose.slice(1).replace(/[.!?]*$/, ".")}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([
          ["guide", "How to build it"],
          ["blueprint", "Blueprint & system prompt"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key
                ? "border-forge-500 text-forge-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "guide" ? (
        <div className="mt-6">
          {bp.buildPlan?.useCase ? (
            <BuildGuide plan={bp.buildPlan} appName={bp.name} />
          ) : (
            <Card className="p-6 text-center text-sm text-slate-500">
              This blueprint was created before the latest build guide. Generate it now — your edited
              system prompt and test results are kept.
              <div className="mt-3">
                <Button size="sm" onClick={loadPlan} disabled={loadingPlan || !state.description}>
                  {loadingPlan ? <><Spinner /> Generating…</> : "Generate the build guide"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InfoCard title="Target users">
            <p className="text-sm text-slate-600">{bp.targetUsers}</p>
          </InfoCard>
          <InfoCard title="Expected languages">
            <div className="flex flex-wrap gap-1.5">
              {bp.languages.map((l) => (
                <Badge key={l}>{l}</Badge>
              ))}
            </div>
          </InfoCard>
          <InfoCard title="Primary tasks">
            <List items={bp.primaryTasks} />
          </InfoCard>
          <InfoCard title="Nigerian-context considerations">
            <List items={bp.nigerianContext} />
          </InfoCard>
          <InfoCard title="Potential risks" tone="amber">
            <List items={bp.risks} />
          </InfoCard>
          <InfoCard title="Recommended N-ATLAS configuration">
            <dl className="space-y-1 text-sm text-slate-600">
              <Row k="Model" v="N-ATLAS (NCAIR1/N-ATLaS)" />
              <Row k="Temperature" v="0.2 (focused, consistent)" />
              <Row k="Languages" v={bp.languages.join(", ")} />
            </dl>
          </InfoCard>
        </div>
  
        <Card className="mt-6 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">System instructions</h2>
            <span className="text-xs text-slate-400">
              Editable — this is your app's behaviour
            </span>
          </div>
          <textarea
            className="h-64 w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 focus:border-forge-500 focus:outline-none focus:ring-2 focus:ring-forge-500/20"
            value={state.systemPrompt}
            onChange={(e) =>
              dispatch({ type: "setSystemPrompt", systemPrompt: e.target.value })
            }
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() =>
                dispatch({ type: "setSystemPrompt", systemPrompt: bp.systemPrompt })
              }
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Reset to generated prompt
            </button>
            <span className="text-xs text-slate-400">
              Tip: we'll test whether this prompt resists attacks in the Secure step.
            </span>
          </div>
        </Card>
        </>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "setStep", step: "describe" })}
        >
          ← Back
        </Button>
        <Button onClick={() => dispatch({ type: "setStep", step: "playground" })}>
          Continue to Playground →
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "amber";
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h3
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
          tone === "amber" ? "text-amber-600" : "text-slate-400"
        }`}
      >
        {title}
      </h3>
      {children}
    </Card>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm text-slate-600">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
          {it}
        </li>
      ))}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right font-medium text-slate-700">{v}</dd>
    </div>
  );
}

function sectorLabel(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
