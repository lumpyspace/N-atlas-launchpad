import { useEffect, useRef, useState } from "react";
import { getHealth, switchMode, type HealthStatus } from "./api";
import { ProjectProvider, useProject } from "./state/ProjectContext";
import Stepper from "./components/Stepper";
import ModeBadge, { modeHint } from "./components/ModeBadge";
import Landing from "./screens/Landing";
import Describe from "./screens/Describe";
import Blueprint from "./screens/Blueprint";
import Evaluate from "./screens/Evaluate";
import Compare from "./screens/Compare";
import Secure from "./screens/Secure";
import Improve from "./screens/Improve";
import Export from "./screens/Export";
import Playground from "./components/Playground";

export default function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}

function Shell() {
  const { state } = useProject();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const refreshHealth = () =>
    getHealth().then(setHealth).catch(() => setHealth(null));

  useEffect(() => { refreshHealth(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [state.step]);

  if (state.step === "landing") {
    return (
      <>
        <TopBar health={health} onHealthChange={setHealth} minimal />
        <Landing />
      </>
    );
  }

  return (
    <>
      <TopBar health={health} onHealthChange={setHealth} />
      <div className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-3">
          <Stepper />
          <p className="mt-2 text-xs text-slate-400">{modeHint(health)}</p>
        </div>
      </div>
      <main>{renderStep(state.step, health)}</main>
    </>
  );
}

function renderStep(step: string, health: HealthStatus | null) {
  switch (step) {
    case "describe":
      return <Describe />;
    case "blueprint":
      return <Blueprint />;
    case "playground":
      return <Playground health={health} />;
    case "evaluate":
      return <Evaluate />;
    case "compare":
      return <Compare />;
    case "secure":
      return <Secure />;
    case "improve":
      return <Improve />;
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
  const { dispatch } = useProject();
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
      setConnected(ms ? `Connected — first response in ${ms}ms` : "Connected to N-ATLAS");
      setTimeout(() => setConnected(null), 6000);
    } catch (e: any) {
      setErr(e.message ?? "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <button
          onClick={() => dispatch({ type: "setStep", step: "landing" })}
          className="flex items-center gap-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forge-500 text-sm font-bold text-white">
            N
          </span>
          <span className="font-bold tracking-tight text-ink">
            N-ATLAS Launchpad
          </span>
        </button>
        <div className="flex items-center gap-3">
          {!minimal && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              Powered by N-ATLAS
            </span>
          )}
          <ModeBadge health={health} />
          <button
            onClick={() => { setOpen(o => !o); setErr(null); setTimeout(() => inputRef.current?.focus(), 50); }}
            className={
              isConnected
                ? "rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                : "rounded-md border border-forge-400 px-2.5 py-1 text-xs font-medium text-forge-600 hover:bg-forge-50 transition-colors"
            }
          >
            {isConnected ? "Settings" : "Connect to N-ATLAS"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3">
          <div className="mx-auto max-w-5xl flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Ollama endpoint</label>
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
              <label className="text-xs font-medium text-slate-600">Model name</label>
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
              {busy ? "Connecting…" : "Connect"}
            </button>
            <button
              onClick={() => { setOpen(false); setErr(null); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
            {err && <p className="w-full text-xs text-red-600">{err}</p>}
          </div>
        </div>
      )}
      {connected && (
        <div className="border-t border-green-100 bg-green-50 px-6 py-2 text-xs text-green-700 font-medium">
          ✓ {connected} — responses may take 5–15s while the model runs on CPU
        </div>
      )}
    </header>
  );
}
