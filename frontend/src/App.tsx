import { useEffect, useRef, useState } from "react";
import { getHealth, switchMode, type HealthStatus } from "./api";
import { ProjectProvider, useWorkspace } from "./state/ProjectContext";
import ModeBadge, { modeHint } from "./components/ModeBadge";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { useT } from "./i18n";
import WorkspaceLayout from "./components/WorkspaceLayout";
import Home from "./screens/Home";
import Landing from "./screens/Landing";
import Describe from "./screens/Describe";
import Blueprint from "./screens/Blueprint";
import Compare from "./screens/Compare";
import Export from "./screens/Export";
import Test from "./screens/Test";
import PromptStudio from "./screens/PromptStudio";
import Knowledge from "./screens/Knowledge";
import Doctor from "./screens/Doctor";

export default function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}

function Shell() {
  const { workspace, current } = useWorkspace();
  const t = useT();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const refreshHealth = () =>
    getHealth().then(setHealth).catch(() => setHealth(null));

  useEffect(() => { refreshHealth(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [workspace.view, current?.id, current?.step]);

  if (workspace.view === "landing" || (workspace.view === "project" && !current)) {
    return (
      <>
        <TopBar health={health} onHealthChange={setHealth} minimal />
        <Landing />
      </>
    );
  }

  if (workspace.view === "doctor") {
    return (
      <>
        <TopBar health={health} onHealthChange={setHealth} />
        <Doctor health={health} />
      </>
    );
  }

  if (workspace.view === "home") {
    return (
      <>
        <TopBar health={health} onHealthChange={setHealth} />
        <Home />
      </>
    );
  }

  return (
    <>
      <TopBar health={health} onHealthChange={setHealth} />
      <WorkspaceLayout>
        <p className="pt-3 text-xs text-slate-400">{modeHint(health, t)}</p>
        <main>{renderStep(current!.step, health)}</main>
      </WorkspaceLayout>
    </>
  );
}

function renderStep(step: string, health: HealthStatus | null) {
  switch (step) {
    case "describe":
      return <Describe />;
    case "blueprint":
      return <Blueprint />;
    case "prompt":
      return <PromptStudio />;
    case "knowledge":
      return <Knowledge />;
    case "playground":
    case "evaluate":
    case "secure":
    case "improve":
      return <Test health={health} />;
    case "compare":
      return <Compare />;
    case "export":
      return <Export />;
    default:
      return <Describe />;
  }
}

function TopBar({
  health,
  onHealthChange,
  minimal = false,
}: {
  health: HealthStatus | null;
  onHealthChange: (h: HealthStatus) => void;
  minimal?: boolean;
}) {
  const { workspace, setView } = useWorkspace();
  const t = useT();
  const hasProjects = workspace.order.length > 0;
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("http://localhost:11434/v1");
  const [model, setModel] = useState("n-atlas");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isConnected = health?.provider === "http" && health?.ok;
  const [connected, setConnected] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const h = await switchMode({ endpoint, model });
      onHealthChange(h);
      setOpen(false);
      const ms = h.detail.match(/(\d+)ms/)?.[1];
      setConnected(ms ? t("Connected — first response in {ms}ms", { ms }) : t("Connected to N-ATLAS"));
      setTimeout(() => setConnected(null), 6000);
    } catch (e: any) {
      setErr(e.message ?? t("Connection failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-5">
        <button
          onClick={() => setView("landing")}
          className="flex items-center gap-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forge-500 text-sm font-bold text-white">
            N
          </span>
          <span className="font-bold tracking-tight text-ink">
            N-ATLAS Launchpad
          </span>
        </button>
        {hasProjects && (
          <button
            onClick={() => setView("home")}
            className={`text-sm font-medium ${workspace.view === "home" ? "text-forge-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t("My projects")}
          </button>
        )}
        </div>
        <div className="flex items-center gap-3">
          {!minimal && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              {t("Powered by N-ATLAS")}
            </span>
          )}
          <LanguageSwitcher compact={minimal} />
          <button
            onClick={() => setView("doctor")}
            title={t("Check your N-ATLAS setup and how to fix it")}
            className={`hidden text-xs font-medium sm:inline ${workspace.view === "doctor" ? "text-forge-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            🩺 {t("Setup doctor")}
          </button>
          <ModeBadge health={health} />
          <button
            onClick={() => {
              // Start from what the backend is actually using, so "Connect" never quietly reverts a custom model.
              if (!open && health?.endpoint) setEndpoint(health.endpoint.replace(/\/chat\/completions\/?$/, ""));
              if (!open && health?.model) setModel(health.model);
              setOpen(o => !o);
              setErr(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className={
              isConnected
                ? "rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                : "rounded-md border border-forge-400 px-2.5 py-1 text-xs font-medium text-forge-600 hover:bg-forge-50 transition-colors"
            }
          >
            {isConnected ? t("Settings") : t("Connect to N-ATLAS")}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3">
          <div className="mx-auto max-w-5xl flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">{t("Ollama endpoint")}</label>
              <input
                ref={inputRef}
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connect()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-forge-400"
                placeholder="http://localhost:11434/v1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">{t("Model name")}</label>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connect()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-forge-400"
                placeholder="n-atlas"
              />
            </div>
            <button
              onClick={connect}
              disabled={busy || !endpoint.trim()}
              className="rounded-md bg-forge-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-forge-600 disabled:opacity-50 transition-colors"
            >
              {busy ? t("Connecting…") : t("Connect")}
            </button>
            <button
              onClick={() => { setOpen(false); setErr(null); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {t("Cancel")}
            </button>
            {err && <p className="w-full text-xs text-red-600">{err}</p>}
            <button
              onClick={() => {
                setOpen(false);
                setView("doctor");
              }}
              className="w-full text-left text-xs font-medium text-forge-700 hover:underline"
            >
              🩺 {t("Something not working? Run the setup doctor →")}
            </button>
          </div>
        </div>
      )}
      {connected && (
        <div className="border-t border-green-100 bg-green-50 px-6 py-2 text-xs text-green-700 font-medium">
          ✓ {connected} — {t("responses may take 5–15s while the model runs on CPU")}
        </div>
      )}
    </header>
  );
}
