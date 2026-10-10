import { useEffect, useRef, useState } from "react";
import { DOCTOR_CHECKS, streamDoctor, type DoctorCheckId, type DoctorResult, type HealthStatus } from "../api";
import { N_, useT } from "../i18n";
import { useWorkspace } from "../state/ProjectContext";
import { Button, Card, Spinner } from "../ui";

const TITLE: Record<DoctorCheckId, string> = {
  endpoint: N_("N-ATLAS server"),
  model: N_("Model"),
  build: N_("Model build"),
  context: N_("Context window"),
  settings: N_("Recommended settings"),
  reply: N_("First reply"),
  speed: N_("Speed"),
  hardware: N_("Hardware"),
};

/** What each result means, keyed "check:variant" (skips by variant alone). The backend only measures. */
const TEXT: Record<string, string> = {
  "endpoint:ok": N_("Reachable at {endpoint} ({ms} ms)."),
  "endpoint:down": N_("Can't reach {endpoint} ({error}). Start Ollama, or check the address in Connect to N-ATLAS."),
  "endpoint:auth": N_("{endpoint} refused the API key (HTTP {status}). Check the key in Connect to N-ATLAS or NATLAS_API_KEY."),
  "model:ok": N_("“{model}” is installed."),
  "model:unlisted": N_("The server doesn't list its models, so the first reply will show whether “{model}” works."),
  "model:missing": N_("“{model}” isn't on this server. It has: {available}."),
  "build:ok": N_("{size} parameters, {quant} quantisation — a good balance of quality and speed."),
  "build:lowBit": N_("{size} parameters, {quant} quantisation. Builds this small lose quality, especially in Yoruba, Hausa and Igbo — prefer Q4_K_M or higher."),
  "context:ok": N_("{numCtx} tokens — room for N-ATLAS's full context."),
  "context:small": N_("Set to {numCtx} tokens, but N-ATLAS can use {context}. Anything longer — system prompt, documents and chat history together — is cut off without warning. Rebuild the model with a bigger window:"),
  "context:default": N_("Not set, so Ollama's default (2,048–4,096 tokens) applies, but N-ATLAS can use {context}. Longer prompts are cut off without warning. Rebuild the model with a bigger window:"),
  "settings:ok": N_("Temperature {temperature} and repetition penalty {repeat} match the model card."),
  "settings:differs": N_("Temperature {temperature}, repetition penalty {repeat}; the model card recommends {recTemperature} and {recRepeat}. Launchpad and the SDK send these with every request, but other apps use the model's own settings — set them in the model too:"),
  "reply:ok": N_("Answered in {totalS}s (first words after {ttftS}s): “{text}”"),
  "reply:cold": N_("Answered in {totalS}s (first words after {ttftS}s), including loading the model into memory: “{text}”"),
  "reply:error": N_("N-ATLAS didn't answer: {error}"),
  "speed:fast": N_("{tps} tokens a second — fast enough for real users."),
  "speed:ok": N_("{tps} tokens a second — a 200-token reply takes about {est}s. Fine for building and testing; serve it on a GPU for real users."),
  "speed:slow": N_("{tps} tokens a second — a 200-token reply takes about {est}s. That's normal on a laptop CPU; for real users, serve N-ATLAS on a GPU."),
  "hardware:gpu": N_("Running on the GPU ({gpuPct}% of the {modelGb} GB model in GPU memory)."),
  "hardware:partialGpu": N_("Only {gpuPct}% of the {modelGb} GB model fits in GPU memory; the rest runs on the CPU, which slows replies down."),
  "hardware:cpu": N_("Running on the CPU. This computer has {freeGb} GB of {totalGb} GB memory free; the model uses about {modelGb} GB."),
  "hardware:cpuRemote": N_("Running on the server's CPU (the model uses about {modelGb} GB)."),
  "hardware:lowRam": N_("This computer has {totalGb} GB of memory and the model uses about {modelGb} GB, so it may swap to disk and slow down a lot. Close other apps, or use a smaller build or a GPU server."),
  "hardware:lowFree": N_("Running on the CPU with only {freeGb} GB of {totalGb} GB memory free (the model uses about {modelGb} GB). Other apps are squeezing it, so the computer may be swapping to disk — close browsers and other heavy apps, then run the checks again."),
  notOllama: N_("Only checked for Ollama servers."),
  noServer: N_("Skipped — the server isn't reachable."),
  noModel: N_("Skipped — the model isn't installed."),
  noReply: N_("Skipped — N-ATLAS didn't reply."),
  unknown: N_("Couldn't tell — the model wasn't loaded."),
};

const ICON: Record<DoctorResult["status"], { mark: string; cls: string }> = {
  pass: { mark: "✓", cls: "bg-forge-500 text-white" },
  warn: { mark: "!", cls: "bg-amber-400 text-white" },
  fail: { mark: "✕", cls: "bg-red-500 text-white" },
  info: { mark: "i", cls: "bg-blue-100 text-blue-700" },
  skip: { mark: "–", cls: "bg-slate-100 text-slate-400" },
};

/**
 * Setup doctor: checks the developer's N-ATLAS setup step by step — server,
 * model, build, context window, settings, a real reply, speed, hardware — and
 * shows exactly how to fix anything wrong. It never changes anything itself.
 */
export default function Doctor({ health }: { health: HealthStatus | null }) {
  const t = useT();
  const { workspace, current, setView } = useWorkspace();
  const [results, setResults] = useState<DoctorResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setResults([]);
    setError(null);
    setRunning(true);
    try {
      await streamDoctor((e) => {
        if (ctrl.signal.aborted) return;
        if (e.type === "check") setResults((r) => [...r, e.result]);
        else if (e.type === "error") setError(e.message);
      }, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setRunning(false);
      }
    }
  }

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = (s: DoctorResult["status"]) => results.filter((r) => r.status === s).length;
  const back = () => setView(current ? "project" : workspace.order.length ? "home" : "landing");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={back} className="text-xs font-medium text-slate-400 hover:text-slate-600">
        ← {t("Back")}
      </button>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">🩺 {t("Setup doctor")}</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            {t("Checks your N-ATLAS setup step by step and tells you exactly how to fix anything that's wrong. It never changes anything itself.")}
          </p>
          {health?.endpoint && (
            <p className="mt-1 text-xs text-slate-400">
              {t("Checking {endpoint} · model {model}", {
                endpoint: health.endpoint.replace(/\/chat\/completions\/?$/, ""),
                model: health.model ?? "n-atlas",
              })}
            </p>
          )}
        </div>
        <Button onClick={run} disabled={running}>
          {running ? (
            <>
              <Spinner /> {t("Checking…")}
            </>
          ) : results.length ? (
            t("Run again")
          ) : (
            t("Run the checks")
          )}
        </Button>
      </div>

      {results.length > 0 && !running && (
        <p className="mt-4 text-sm font-medium text-slate-700">
          {t("{pass} fine · {warn} to look at · {fail} to fix", { pass: count("pass") + count("info"), warn: count("warn"), fail: count("fail") })}
        </p>
      )}

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t("The doctor couldn't run: {message}", { message: error })}</div>}

      <Card className="mt-4 divide-y divide-slate-100">
        {DOCTOR_CHECKS.map((id) => {
          const r = results.find((x) => x.id === id);
          const next = running && !r && DOCTOR_CHECKS.slice(0, DOCTOR_CHECKS.indexOf(id)).every((p) => results.some((x) => x.id === p));
          // One Modelfile fixes both the context window and the settings: show it once.
          const shown = r?.command && results.some((x) => x.id !== id && x.command === r.command && DOCTOR_CHECKS.indexOf(x.id) < DOCTOR_CHECKS.indexOf(id));
          return <CheckRow key={id} id={id} result={r && shown ? { ...r, command: undefined } : r} active={next} sameFixAbove={!!shown} />;
        })}
      </Card>
      <p className="mt-3 text-[11px] text-slate-400">
        {t("The first-reply check really asks N-ATLAS a question, so on a laptop it can take a minute — longer if the model has to load first.")}
      </p>
    </div>
  );
}

function CheckRow({
  id,
  result,
  active,
  sameFixAbove = false,
}: {
  id: DoctorCheckId;
  result?: DoctorResult;
  active: boolean;
  /** The fix is the same command as an earlier check's. */
  sameFixAbove?: boolean;
}) {
  const t = useT();
  // "default" means the model doesn't set it.
  const data = result && Object.fromEntries(Object.entries(result.data).map(([k, v]) => [k, v === "default" ? t("not set") : v]));
  const [copied, setCopied] = useState(false);
  const icon = result ? ICON[result.status] : null;
  const text = result ? TEXT[`${id}:${result.variant}`] ?? TEXT[result.variant] : undefined;
  return (
    <div className="flex gap-3 p-4">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          icon ? icon.cls : "border border-slate-200 text-slate-300"
        }`}
        aria-hidden
      >
        {icon ? icon.mark : active ? <Spinner className="h-3 w-3 text-forge-500" /> : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${result ? "text-slate-800" : "text-slate-400"}`}>{t(TITLE[id])}</div>
        {active && <p className="text-xs text-slate-400">{t("Checking…")}</p>}
        {text && (
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
            {t(text, data)}
            {sameFixAbove && <span className="text-slate-400"> {t("(The same Modelfile above fixes this too.)")}</span>}
          </p>
        )}
        {result?.command && (
          <div className="relative mt-2">
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 pr-16 text-[12px] leading-relaxed text-slate-100">
              <code>{result.command}</code>
            </pre>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.command!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked; the text is still selectable */
                }
              }}
              className="absolute right-2 top-2 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
            >
              {copied ? "✓" : t("Copy")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
