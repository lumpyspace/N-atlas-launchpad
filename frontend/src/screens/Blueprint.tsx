import { useState } from "react";
import { getBlueprint } from "../api";
import { BuildGuide, ByNatlas, Narrated } from "../components/BuildGuide";
import { useNarration } from "../components/useNarration";
import { useProject, useWorkspace } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";
import { N_, useT } from "../i18n";

type Tab = "guide" | "blueprint";

export default function Blueprint() {
  const { state, dispatch } = useProject();
  const { mode } = useWorkspace();
  const t = useT();
  const bp = state.blueprint;
  // N-ATLAS writes the guide's words in the project's language (the engine keeps the facts).
  const narr = useNarration(bp?.buildPlan?.useCase ? bp : null);
  // N-ATLAS's feature names double as the primary tasks (the features are built from them, in order).
  const written = narr.value<{ task: string; how: string }[]>("features");
  const taskNames = written && bp && written.length === bp.primaryTasks.length ? written.map((f) => f.task) : undefined;
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
            {t("No blueprint yet. Start by describing your application.")}
          </p>
          <Button
            className="mt-4"
            onClick={() => dispatch({ type: "setStep", step: "describe" })}
          >
            ← {t("Describe your app")}
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
            <Badge tone="green">{t(bp.buildPlan?.useCase?.label ?? sectorLabel(bp.sector))}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-slate-600">
            {narr.value<string>("purpose") ??
              bp.purpose.charAt(0).toUpperCase() + bp.purpose.slice(1).replace(/[.!?]*$/, ".")}
            {narr.value("purpose") && (
              <span title={t("Written by N-ATLAS")} className="ml-2 rounded-full bg-forge-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-forge-700">
                ✍ N-ATLAS
              </span>
            )}
          </p>
        </div>
      </div>

      {mode === "developer" && (
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([
          ["guide", N_("How to build it")],
          ["blueprint", N_("Blueprint & system prompt")],
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
            {t(label)}
          </button>
        ))}
      </div>
      )}

      {tab === "guide" || mode === "simple" ? (
        <div className="mt-6">
          {bp.buildPlan?.useCase ? (
            <BuildGuide
              plan={bp.buildPlan}
              appName={bp.name}
              narr={narr}
              simple={mode === "simple"}
              onChangeUseCase={async (id) => {
                const fresh = await getBlueprint(state.description, id);
                dispatch({ type: "setBlueprint", blueprint: fresh });
              }}
            />
          ) : (
            <Card className="p-6 text-center text-sm text-slate-500">
              {t("This blueprint was created before the latest build guide. Generate it now — your edited system prompt and test results are kept.")}
              <div className="mt-3">
                <Button size="sm" onClick={loadPlan} disabled={loadingPlan || !state.description}>
                  {loadingPlan ? <><Spinner /> {t("Generating…")}</> : t("Generate the build guide")}
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InfoCard title={t("Target users")} tag={<ByNatlas narr={narr} section="audience" />}>
            <Narrated narr={narr} section="audience">
              <p className="text-sm text-slate-600">{narr.value<string>("audience") ?? bp.targetUsers}</p>
            </Narrated>
          </InfoCard>
          <InfoCard title={t("Expected languages")}>
            <div className="flex flex-wrap gap-1.5">
              {bp.languages.map((l) => (
                <Badge key={l}>{t(l)}</Badge>
              ))}
            </div>
          </InfoCard>
          <InfoCard title={t("Primary tasks")} tag={taskNames && <ByNatlas narr={narr} section="features" />}>
            <List items={taskNames ?? bp.primaryTasks} />
          </InfoCard>
          <InfoCard title={t("Nigerian-context considerations")} tag={<ByNatlas narr={narr} section="context" />}>
            <Narrated narr={narr} section="context">
              <List items={narr.value<string[]>("context") ?? bp.nigerianContext} />
            </Narrated>
          </InfoCard>
          <InfoCard title={t("Potential risks")} tone="amber" tag={<ByNatlas narr={narr} section="risks" />}>
            <Narrated narr={narr} section="risks">
              <List items={narr.value<string[]>("risks") ?? bp.risks} />
            </Narrated>
          </InfoCard>
          <InfoCard title={t("Recommended N-ATLAS configuration")}>
            <dl className="space-y-1 text-sm text-slate-600">
              <Row k={t("Model")} v="N-ATLAS (NCAIR1/N-ATLaS)" />
              <Row k={t("Temperature")} v={t("0.2 (focused, consistent)")} />
              <Row k={t("Languages")} v={bp.languages.join(", ")} />
            </dl>
          </InfoCard>
        </div>
  
        <Card className="mt-6 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t("System instructions")}</h2>
            <span className="text-xs text-slate-400">{t("Editable — this is your app's behaviour")}</span>
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
              {t("Reset to generated prompt")}
            </button>
            <span className="text-xs text-slate-400">
              {t("It starts with security rules built in; Test → Security attacks it to check they hold.")}
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
          ← {t("Back")}
        </Button>
        <Button onClick={() => dispatch({ type: "setStep", step: "playground" })}>
          {t("Continue to Test →")}
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  tone,
  tag,
  children,
}: {
  title: string;
  tone?: "amber";
  /** e.g. the "✍ N-ATLAS" tag when N-ATLAS wrote the card. */
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h3
        className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
          tone === "amber" ? "text-amber-600" : "text-slate-400"
        }`}
      >
        {title}
        {tag}
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
