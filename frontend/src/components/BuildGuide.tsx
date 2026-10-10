import { useEffect, useState } from "react";
import { getUseCases, type BuildPlan, type UseCaseOption } from "../api";
import { useProject, useWorkspace, type Step } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";
import { LANGUAGES, N_, useT } from "../i18n";
import type { NarrationSection } from "../api";
import type { NarrationView } from "./useNarration";

type Plan = BuildPlan;

const NODE_STYLE: Record<Plan["architecture"][number]["kind"], string> = {
  user: "border-slate-300 bg-white",
  yours: "border-blue-200 bg-blue-50",
  natlas: "border-forge-300 bg-forge-50",
  optional: "border-amber-200 bg-amber-50",
};

const NODE_TAG: Record<Plan["architecture"][number]["kind"], string> = {
  user: N_("User"),
  yours: N_("You build"),
  natlas: "N-ATLAS",
  optional: N_("You connect"),
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
  documents: N_("Official documents"),
  "live-data": N_("Live data"),
  "your-content": N_("Your content"),
};

const STEP_LINK: Record<string, { step: Step; label: string }> = {
  playground: { step: "playground", label: N_("Open Test → Try it") },
  evaluate: { step: "evaluate", label: N_("Open Test → Test cases") },
  compare: { step: "compare", label: N_("Open Compare") },
  secure: { step: "secure", label: N_("Open Security tests") },
  export: { step: "export", label: N_("Open Export") },
};

/** "How to build it": a plan specific to this app idea. */
export function BuildGuide({
  plan,
  appName,
  onChangeUseCase,
  narr,
}: {
  plan: Plan;
  appName: string;
  /** Rebuild the blueprint for a different kind of app. */
  onChangeUseCase: (id: string) => Promise<void>;
  /** Sections N-ATLAS has written (or is writing) for this guide. */
  narr: NarrationView;
}) {
  const { dispatch } = useProject();
  const { language } = useWorkspace();
  const t = useT();
  const go = (step: Step) => dispatch({ type: "setStep", step });

  return (
    <div className="space-y-6">
      <NarrationBar narr={narr} />
      {language !== "en" && narr.done > 0 && (
        <p className="-mt-3 text-[11px] text-slate-400">
          {t("Sections marked ✍ N-ATLAS were written by N-ATLAS in your language; the rest of this guide is still in English.")}
        </p>
      )}
      {/* What you're building */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900">{t("What you're building")}</h2>
          {plan.useCase.label.split(" + ").map((l) => (
            <Badge key={l} tone="green">
              {t(l)}
            </Badge>
          ))}
          <Badge>{t(plan.channel.label)}</Badge>
          {plan.voice.needed && <Badge tone="blue">{t("Voice input")}</Badge>}
          <ByNatlas narr={narr} section="summary" />
        </div>
        <Narrated narr={narr} section="summary">
          <p className="mt-2 text-sm text-slate-600">{narr.value<string>("summary") ?? plan.useCase.summary}</p>
        </Narrated>
        <UseCasePicker current={plan.useCase.ids[0]} onChange={onChangeUseCase} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("How it should feel")}
              <ByNatlas narr={narr} section="conversation" />
            </div>
            <Narrated narr={narr} section="conversation">
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="ml-8 rounded-lg rounded-br-sm bg-forge-500 px-3 py-2 text-white">
                  {(narr.value<{ user: string; app: string }>("conversation") ?? plan.conversation).user}
                </div>
                <div className="mr-8 rounded-lg rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-slate-700">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase text-forge-600">{appName}</div>
                  {(narr.value<{ user: string; app: string }>("conversation") ?? plan.conversation).app}
                </div>
              </div>
            </Narrated>
            <p className="mt-1 text-[11px] text-slate-400">
              {t("Illustrative — “…” marks facts your app fills in from its data.")}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("Start with this first version")}
              <ByNatlas narr={narr} section="mvp" />
            </div>
            <Narrated narr={narr} section="mvp">
              <Bullets items={narr.value<string[]>("mvp") ?? plan.mvp} />
            </Narrated>
          </div>
        </div>
      </Card>

      {/* Architecture */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">{t("How your app fits together")}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {plan.channel.why}
          {plan.voice.needed && " " + t("It also takes voice input, so speech recognition comes first.")}
        </p>
        <ArchitectureDiagram nodes={plan.architecture} />
        <p className="mt-3 text-xs text-slate-400">
          {plan.knowledge.needed
            ? t("The reply travels back the same way. Only your backend talks to N-ATLAS, so your system prompt, data and keys stay private.")
            : t("The reply travels back the same way. Only your backend talks to N-ATLAS, so your system prompt and keys stay private.")}
        </p>
      </Card>

      {/* Features */}
      {plan.features.length > 0 && (
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            {t("Feature by feature")}
            <ByNatlas narr={narr} section="features" />
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("Not everything should be left to the model. Here's the right technique for each feature of {app}.", { app: appName })}
          </p>
          <Narrated narr={narr} section="features">
            <div className="mt-4 divide-y divide-slate-100">
              {plan.features.map((f, i) => {
                const written = narr.value<{ task: string; how: string }[]>("features")?.[i];
                return (
                  <div key={f.task} className="grid gap-1 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{written?.task ?? f.task}</div>
                      {/* The developer's own feature name, so a drifting translation is easy to spot. */}
                      {written && written.task !== f.task && <div className="text-[11px] text-slate-400">{f.task}</div>}
                      <Badge tone={APPROACH_TONE[f.approach]} className="mt-1">
                        {t(f.approachLabel)}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">{written?.how ?? f.how}</p>
                  </div>
                );
              })}
            </div>
          </Narrated>
        </Card>
      )}

      {/* Data sources */}
      {plan.dataSources.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900">{t("Where your facts must come from")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("N-ATLAS doesn't know these — collect them before launch and feed the relevant parts into each answer.")}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {plan.dataSources.map((d) => (
              <div key={d.name} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{d.name}</div>
                  <Badge tone={d.kind === "live-data" ? "amber" : d.kind === "documents" ? "blue" : "slate"}>
                    {t(SOURCE_KIND[d.kind])}
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
        <h2 className="font-semibold text-slate-900">{t("Build it, step by step")}</h2>
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
                        {t(STEP_LINK[s.launchpadStep].label)} →
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
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-600">
            {t("Mistakes to avoid in this kind of app")}
            <ByNatlas narr={narr} section="pitfalls" />
          </h3>
          <Narrated narr={narr} section="pitfalls">
            <Bullets items={narr.value<string[]>("pitfalls") ?? plan.pitfalls} />
          </Narrated>
        </Card>
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">{t("N-ATLAS limits to plan for")}</h3>
          <Bullets items={plan.watchOut} />
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-forge-600">{t("Where N-ATLAS fits well")}</h3>
          <Bullets items={plan.goodFit} />
        </Card>
      </div>

      {/* Success */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">{t("How you'll know it works")}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Measure")}</div>
            <Bullets items={plan.metrics} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Test with messages like")}</div>
            <ul className="space-y-1.5">
              {plan.testMessages.map((m) => (
                <li key={m} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700">
                  {m}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => go("playground")}>
              {t("Try them in Test →")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Licence */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Licence & attribution")}</h3>
          <Badge>{t("Check before launch")}</Badge>
        </div>
        <Bullets items={plan.license} />
        <p className="mt-2 text-xs text-slate-400">
          {t("Summary of the model card — read the full")}{" "}
          <a
            href="https://huggingface.co/NCAIR1/N-ATLaS"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-600"
          >
            {t("N-ATLaS Terms of Use")}
          </a>{" "}
          {t("before deploying.")}
        </p>
      </Card>
    </div>
  );
}

/** Where N-ATLAS stands on writing this guide, with Stop / Rewrite. */
function NarrationBar({ narr }: { narr: NarrationView }) {
  const t = useT();
  const { language } = useWorkspace();
  const name = LANGUAGES.find((l) => l.code === language)?.native ?? "English";
  const box = "flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2 text-xs";
  if (narr.running) {
    return (
      <div className={`${box} border-forge-200 bg-forge-50 text-forge-800`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-forge-500" />
        <b>{t("✍ N-ATLAS is writing this guide in {language}…", { language: name })}</b>
        <span>{t("{done} of {total} sections", { done: narr.done, total: narr.total })}</span>
        <span className="text-forge-700/70">{t("You can read the guide meanwhile; sections update as they're written.")}</span>
        <button onClick={narr.stop} className="ml-auto font-medium hover:underline">
          ■ {t("Stop")}
        </button>
      </div>
    );
  }
  if (narr.error) {
    return (
      <div className={`${box} border-amber-200 bg-amber-50 text-amber-800`}>
        {t("N-ATLAS couldn't write the guide: {error}", { error: narr.error })}
        <button onClick={() => narr.write()} className="ml-auto font-medium hover:underline">
          {t("Try again")}
        </button>
      </div>
    );
  }
  if (narr.done < narr.total - narr.failed.length) {
    return (
      <div className={`${box} border-slate-200 bg-white text-slate-600`}>
        <button onClick={() => narr.write()} className="font-medium text-forge-700 hover:underline">
          ✍ {t("Let N-ATLAS write this guide in {language}", { language: name })}
        </button>
      </div>
    );
  }
  return (
    <div className={`${box} border-slate-200 bg-white text-slate-500`}>
      <span>✍ {t("{n} sections written by N-ATLAS in {language}", { n: narr.done, language: name })}</span>
      {narr.failed.length > 0 && (
        <span title={narr.failed.map((s) => `${s}: ${narr.problem(s)}`).join("\n")}>
          · {t("{n} kept the guide's own text", { n: narr.failed.length })}
        </span>
      )}
      <button onClick={() => narr.write(narr.failed.length ? narr.failed : undefined)} className="ml-auto font-medium text-forge-700 hover:underline" hidden={!narr.failed.length}>
        {t("Try those again")}
      </button>
    </div>
  );
}

/** "✍ N-ATLAS" next to a section N-ATLAS wrote, with a button to rewrite it. */
export function ByNatlas({ narr, section }: { narr: NarrationView; section: NarrationSection }) {
  const t = useT();
  if (!narr.value(section)) return null;
  return (
    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
      <span title={t("Written by N-ATLAS")} className="rounded-full bg-forge-50 px-2 py-0.5 text-[10px] font-semibold text-forge-700">
        ✍ N-ATLAS
      </span>
      {!narr.running && (
        <button onClick={() => narr.write([section])} className="text-[10px] font-normal text-slate-400 hover:text-forge-700">
          {t("Rewrite")}
        </button>
      )}
    </span>
  );
}

/** A section's content — or, while N-ATLAS writes it, what it has written so far. */
export function Narrated({ narr, section, children }: { narr: NarrationView; section: NarrationSection; children: React.ReactNode }) {
  const t = useT();
  if (narr.writing?.section === section) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-forge-300 bg-forge-50/40 p-3 text-sm text-slate-700">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-forge-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-500" /> {t("N-ATLAS is writing…")}
        </div>
        <div className="whitespace-pre-wrap">{narr.writing.text || "…"}</div>
      </div>
    );
  }
  const problem = narr.problem(section);
  return (
    <>
      {children}
      {problem && (
        <p className="mt-1 text-[10px] text-slate-400">
          {t("N-ATLAS's version didn't pass a check ({problem}), so this is the guide's own text.", { problem })}{" "}
          {!narr.running && (
            <button onClick={() => narr.write([section])} className="text-forge-700 hover:underline">
              {t("Rewrite")}
            </button>
          )}
        </p>
      )}
    </>
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
  const t = useT();
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
          {t("Show all {n} lines", { n: code.split("\n").length })} ▾
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
        {copied ? "✓" : t("Copy")}
      </button>
    </div>
  );
}

/** "Not the right kind of app?" — lets the developer correct the detection. */
/** User → (speech) → backend → (data) → N-ATLAS. `vertical` for narrow panels. */
export function ArchitectureDiagram({ nodes, vertical = false }: { nodes: Plan["architecture"]; vertical?: boolean }) {
  const t = useT();
  return (
    <div className={`mt-4 flex flex-col items-stretch gap-2 ${vertical ? "" : "md:flex-row md:items-center"}`}>
      {nodes.map((n, i) => (
        <div key={n.label} className={`flex flex-col items-center gap-2 ${vertical ? "" : "md:flex-1 md:flex-row"}`}>
          <div className={`w-full rounded-lg border p-3 ${NODE_STYLE[n.kind]}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t(NODE_TAG[n.kind])}</div>
            <div className="text-sm font-semibold text-slate-800">{n.label}</div>
            <div className="mt-0.5 text-xs text-slate-500">{n.detail}</div>
          </div>
          {i < nodes.length - 1 && (
            <span className={`text-slate-300 ${vertical ? "" : "md:shrink-0"}`} aria-hidden>
              <span className={vertical ? "" : "md:hidden"}>↓</span>
              {!vertical && <span className="hidden md:inline">→</span>}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function UseCasePicker({ current, onChange }: { current: string; onChange: (id: string) => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UseCaseOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !options.length) getUseCases().then(setOptions).catch(() => {});
  }, [open, options.length]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-forge-600 hover:underline">
        {t("Not the right kind of app? Change it")}
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-600">{t("What kind of app is this?")}</div>
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
            {t(o.label)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {t("Picking one rebuilds the blueprint, features and system prompt for that kind of app. Your saved test cases are kept.")}{" "}
        <button onClick={() => setOpen(false)} className="underline">
          {t("Cancel")}
        </button>
      </p>
    </div>
  );
}
