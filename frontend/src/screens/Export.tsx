import { useState } from "react";
import { useProject, useWorkspace } from "../state/ProjectContext";
import { Badge, Button, Card } from "../ui";
import { downloadProjectZip, listProjectFiles } from "../export/zip";
import type { ExportLang, ProjectInput } from "../export/templates";

export default function Export() {
  const { state, dispatch } = useProject();
  const { setView, newProject } = useWorkspace();
  const [lang, setLang] = useState<ExportLang>("js");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bp = state.blueprint;
  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          Describe and build your app first, then export it.
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
      <h1 className="text-2xl font-bold text-ink">Ship your N-ATLAS app</h1>
      <p className="mt-1 text-slate-500">
        Download a real, runnable starter project — your system prompt, an N-ATLAS
        client, your test cases with a scored runner, a GitHub Actions workflow,
        security tests and fine-tuning data. Not a screenshot: actual code.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Language</h2>
          <div className="mt-3 flex gap-2">
            <LangButton active={lang === "js"} onClick={() => setLang("js")}>
              JavaScript
            </LangButton>
            <LangButton active={lang === "python"} onClick={() => setLang("python")}>
              Python
            </LangButton>
          </div>

          <h2 className="mt-5 text-sm font-semibold text-slate-900">
            Recap
          </h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Recap k="Application" v={bp.name} />
            <Recap k="Sector" v={bp.sector} />
            {state.evalResult && (
              <Recap
                k="Evaluation"
                v={`${Math.round(state.evalResult.summary.passRate * 100)}/100`}
              />
            )}
            {state.securityResult && (
              <Recap k="Security" v={`${state.securityResult.summary.score}/100`} />
            )}
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Files in your export
          </h2>
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
          {busy ? "Preparing…" : `Download ${lang === "js" ? "JavaScript" : "Python"} project (.zip)`}
        </Button>
        {done && (
          <Badge tone="green">Downloaded ✓ — unzip and follow the README</Badge>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "setStep", step: "secure" })}
        >
          ← Back
        </Button>
        <div className="flex items-center gap-4">
          <button onClick={() => setView("home")} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            My projects
          </button>
          <button onClick={newProject} className="text-sm font-medium text-forge-600 hover:text-forge-700">
            + Start another project
          </button>
        </div>
      </div>
    </div>
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
