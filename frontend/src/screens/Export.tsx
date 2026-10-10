import { useState } from "react";
import { useProject, useWorkspace } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";
import { downloadProjectZip, listProjectFiles } from "../export/zip";
import type { ExportLang, ProjectInput } from "../export/templates";
import { downloadSdk } from "../utils/sdkDownload";
import { useT } from "../i18n";

export default function Export() {
  const { state, dispatch } = useProject();
  const { setView, newProject } = useWorkspace();
  const t = useT();
  const [lang, setLang] = useState<ExportLang>("js");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bp = state.blueprint;
  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          {t("Describe and build your app first, then export it.")}
        </Card>
      </div>
    );
  }

  const input: ProjectInput = {
    blueprint: bp,
    systemPrompt: state.systemPrompt,
    evalResult: state.evalResult,
    securityResult: state.securityResult,
    savedTestCases: state.savedTestCases,
    knowledge: state.knowledge,
    language: state.language,
  };
  const files = listProjectFiles(input, lang);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadProjectZip(input, lang);
      setDone(true);
      dispatch({ type: "markExported" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-ink">{t("Ship your N-ATLAS app")}</h1>
      <p className="mt-1 text-slate-500">
        {t(
          "Download a real, runnable starter project — your system prompt, the N-ATLAS SDK, your test cases with a scored runner, a GitHub Actions workflow, security tests and fine-tuning data. Not a screenshot: actual code.",
        )}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">{t("Programming language")}</h2>
          <div className="mt-3 flex gap-2">
            <LangButton active={lang === "js"} onClick={() => setLang("js")}>
              JavaScript
            </LangButton>
            <LangButton active={lang === "python"} onClick={() => setLang("python")}>
              Python
            </LangButton>
          </div>

          <h2 className="mt-5 text-sm font-semibold text-slate-900">{t("Recap")}</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Recap k={t("Application")} v={bp.name} />
            <Recap k={t("Sector")} v={t(bp.sector)} />
            {state.evalResult && (
              <Recap
                k={t("Evaluation")}
                v={`${Math.round(state.evalResult.summary.passRate * 100)}/100`}
              />
            )}
            {state.securityResult && (
              <Recap k={t("Security")} v={`${state.securityResult.summary.score}/100`} />
            )}
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">{t("Files in your export")}</h2>
          <ul className="mt-3 space-y-1 font-mono text-xs text-slate-600">
            {files.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-slate-300">›</span>
                {f}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={download} disabled={busy} className="px-6 py-3 text-base">
          {busy ? t("Preparing…") : t("Download {lang} project (.zip)", { lang: lang === "js" ? "JavaScript" : "Python" })}
        </Button>
        {done && (
          <Badge tone="green">{t("Downloaded ✓ — unzip and follow the README")}</Badge>
        )}
      </div>

      <SdkCard lang={lang} />

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "setStep", step: "secure" })}
        >
          ← {t("Back")}
        </Button>
        <div className="flex items-center gap-4">
          <button onClick={() => setView("home")} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            {t("My projects")}
          </button>
          <button onClick={newProject} className="text-sm font-medium text-forge-600 hover:text-forge-700">
            {t("+ Start another project")}
          </button>
        </div>
      </div>
    </div>
  );
}

const SDK_EXAMPLE: Record<ExportLang, string> = {
  js: `import { Natlas } from "./natlas.js";

const natlas = new Natlas(); // local Ollama, or NATLAS_BASE_URL
const reply = await natlas.chat("Abeg, how I fit register my business?", {
  system: "You help small business owners in Nigeria.",
  language: "pid",
});
console.log(reply.text);`,
  python: `from natlas import Natlas

natlas = Natlas()  # local Ollama, or NATLAS_BASE_URL
reply = natlas.chat(
    "Abeg, how I fit register my business?",
    system="You help small business owners in Nigeria.",
    language="pid",
)
print(reply.text)`,
};

/** For developers with an existing codebase: the SDK on its own. */
function SdkCard({ lang }: { lang: ExportLang }) {
  const t = useT();
  const file = lang === "js" ? "natlas.js" : "natlas.py";
  return (
    <Card className="mt-8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t("Already have a codebase? Use the N-ATLAS SDK")}</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            {t(
              "The same client your export uses, on its own: one file with no dependencies. It sets N-ATLAS's recommended settings, adds language hints, answers from your documents with sources, keeps chats inside the 8,092-token context, streams, and gives errors that say how to fix them (“is Ollama running?”).",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => downloadSdk(file)}>
            ⬇ {file}
          </Button>
          {lang === "js" && (
            <button onClick={() => downloadSdk("natlas.d.ts")} className="text-xs font-medium text-forge-700 hover:underline">
              + {t("TypeScript types")}
            </button>
          )}
        </div>
      </div>
      <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">
        <code>{SDK_EXAMPLE[lang]}</code>
      </pre>
      <p className="mt-2 text-xs text-slate-500">
        {lang === "python" ? (
          <>
            {t("Or install it:")} <code className="rounded bg-slate-100 px-1">pip install "git+https://github.com/lumpyspace/N-atlas-launchpad#subdirectory=sdk/python"</code>
            .{" "}
          </>
        ) : null}
        {t("Streaming, documents and errors are covered in the")}{" "}
        <a
          href={`https://github.com/lumpyspace/N-atlas-launchpad/tree/master/sdk/${lang === "js" ? "js" : "python"}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-forge-700 hover:underline"
        >
          {t("SDK docs ↗")}
        </a>
        . {t("Test → Get code writes the call for your exact prompt and settings.")}
      </p>
    </Card>
  );
}

function LangButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
        active
          ? "border-forge-500 bg-forge-50 text-forge-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function Recap({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-medium text-slate-700">{v}</dd>
    </div>
  );
}
