import { useEffect, useRef, useState } from "react";
import { getHealth, switchMode, type HealthStatus } from "./api";
import { ProjectProvider, useWorkspace } from "./state/ProjectContext";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { useT } from "./i18n";
import WorkspaceLayout from "./components/WorkspaceLayout";
import Home from "./screens/Home";
import Landing from "./screens/Landing";
import Describe from "./screens/Describe";
import Blueprint from "./screens/Blueprint";
import Compare from "./screens/Compare";
import Export from "./screens/Export";
import GoLive from "./screens/GoLive";
import Test from "./screens/Test";
import PromptStudio from "./screens/PromptStudio";
import Knowledge from "./screens/Knowledge";
import Doctor from "./screens/Doctor";
import { Spinner } from "./ui";
import { CheckIcon, PulseIcon, SlidersIcon, ZapIcon } from "./ui/icons";

export default function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  );
}

/** Where N-ATLAS stands: checking, waking up (a sleeping GPU), ready, or offline. */
type Wake = "checking" | "waking" | "ready" | "offline";

/**
 * Health, patiently: a GPU that sleeps when idle takes a minute or two to wake,
 * so a slow or failed first check shows "waking up" and tries again instead of
 * looking broken. (Wrong keys and the like are reported straight away.)
 */
function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [wake, setWake] = useState<Wake>("checking");
  const [since, setSince] = useState(() => Date.now());
  const [justWoke, setJustWoke] = useState(false);
  const wakeRef = useRef<Wake>("checking");
  wakeRef.current = wake;

  useEffect(() => {
    let alive = true;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const slow = setTimeout(() => alive && wakeRef.current === "checking" && setWake("waking"), 5000);
    const check = async () => {
      attempts++;
      try {
        const h = await getHealth();
        if (!alive) return;
        setHealth(h);
        if (h.ok) {
          if (wakeRef.current === "waking") {
            setJustWoke(true);
            setTimeout(() => alive && setJustWoke(false), 8000);
          }
          setWake("ready");
          return;
        }
        // Still waking (no answer yet, timed out, busy) — not a wrong key or a missing server.
        const sleeping = h.public && !/HTTP 40[13]|NATLAS_API_KEY|not configured/i.test(h.detail);
        if (sleeping && attempts < 30) {
          setWake("waking");
          retry = setTimeout(check, 10_000);
        } else setWake("offline");
      } catch {
        if (!alive) return;
        setHealth(null);
        setWake("offline");
      }
    };
    setSince(Date.now());
    check();
    return () => {
      alive = false;
      clearTimeout(slow);
      clearTimeout(retry);
    };
  }, []);

  return { health, setHealth, wake, since, justWoke };
}

function Shell() {
  const { workspace, current } = useWorkspace();
  const { health, setHealth, wake, since, justWoke } = useHealth();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [workspace.view, current?.id, current?.step]);

  const top = (
    <>
      <TopBar health={health} wake={wake} since={since} onHealthChange={setHealth} />
      <WakeBanner wake={wake} since={since} justWoke={justWoke} />
    </>
  );

  if (workspace.view === "landing" || (workspace.view === "project" && !current)) {
    return (
      <>
        {top}
        <Landing publicSite={!!health?.public} />
      </>
    );
  }

  if (workspace.view === "doctor") {
    return (
      <>
        {top}
        <Doctor health={health} />
      </>
    );
  }

  if (workspace.view === "home") {
    return (
      <>
        {top}
        <Home />
      </>
    );
  }

  return (
    <>
      {top}
      <WorkspaceLayout>
        <main className="pt-2">{renderStep(current!.step, health)}</main>
      </WorkspaceLayout>
    </>
  );
}

function useSeconds(since: number, on: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return Math.max(0, Math.round((now - since) / 1000));
}

/** Under the top bar while N-ATLAS wakes up — and a moment after, to say it's ready. */
function WakeBanner({ wake, since, justWoke }: { wake: Wake; since: number; justWoke: boolean }) {
  const t = useT();
  const secs = useSeconds(since, wake === "waking");
  if (wake === "waking") {
    return (
      <div className="border-b border-amber-200 bg-amber-50/90 px-6 py-2 text-center text-xs text-amber-900">
        <span className="inline-flex flex-wrap items-center justify-center gap-2">
          <Spinner className="h-3 w-3 text-amber-600" />
          <span className="font-semibold">{t("Waking up N-ATLAS… {n}s", { n: secs })}</span>
          <span>{t("It sleeps on its GPU when nobody is using it; waking takes a minute or two. You can start designing meanwhile.")}</span>
        </span>
      </div>
    );
  }
  if (justWoke) {
    return (
      <div className="border-b border-forge-200 bg-forge-50 px-6 py-2 text-center text-xs font-medium text-forge-800">
        <span className="inline-flex items-center gap-1.5">
          <ZapIcon size={12} /> {t("N-ATLAS is awake — replies now take seconds.")}
        </span>
      </div>
    );
  }
  return null;
}

/** One pill for where N-ATLAS stands. */
function StatusPill({ health, wake, since }: { health: HealthStatus | null; wake: Wake; since: number }) {
  const t = useT();
  const secs = useSeconds(since, wake === "waking");
  const look: Record<Wake, { dot: string; text: string; label: string }> = {
    checking: { dot: "bg-slate-300", text: "text-slate-500", label: t("Checking…") },
    waking: { dot: "bg-amber-400 animate-pulse", text: "text-amber-700", label: t("Waking up {n}s", { n: secs }) },
    ready: { dot: "bg-forge-500", text: "text-forge-700", label: t("N-ATLAS ready") },
    offline: { dot: "bg-red-500", text: "text-red-700", label: t("Offline") },
  };
  const l = look[wake];
  return (
    <span
      title={health ? `${health.model} · ${health.detail}` : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium ${l.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${l.dot}`} />
      <span className={`whitespace-nowrap ${wake === "waking" ? "" : "hidden sm:inline"}`}>{l.label}</span>
    </span>
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
    case "golive":
      return <GoLive />;
    default:
      return <Describe />;
  }
}

function TopBar({
  health,
  wake,
  since,
  onHealthChange,
}: {
  health: HealthStatus | null;
  wake: Wake;
  since: number;
  onHealthChange: (h: HealthStatus) => void;
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
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex shrink-0 items-center gap-3 sm:gap-6">
          <button onClick={() => setView("landing")} className="flex shrink-0 items-center gap-2.5">
            <Logo />
            <span className="hidden text-[15px] font-bold tracking-tight text-ink sm:inline">
              N-ATLAS <span className="font-semibold text-slate-500">Launchpad</span>
            </span>
          </button>
          {hasProjects && (
            <button
              onClick={() => setView("home")}
              className={`whitespace-nowrap text-sm font-medium transition-colors ${workspace.view === "home" ? "text-forge-700" : "text-slate-500 hover:text-slate-900"}`}
            >
              {t("My projects")}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher compact />
          <button
            onClick={() => setView("doctor")}
            title={t("Check your N-ATLAS setup and how to fix it")}
            className={`hidden items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors sm:inline-flex ${workspace.view === "doctor" ? "bg-forge-50 text-forge-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <PulseIcon size={14} />
            <span className="hidden lg:inline">{t("Setup doctor")}</span>
          </button>
          <StatusPill health={health} wake={wake} since={since} />
          {!health?.public && (
            <button
              onClick={() => {
                // Start from what the backend is actually using, so "Connect" never quietly reverts a custom model.
                if (!open && health?.endpoint) setEndpoint(health.endpoint.replace(/\/chat\/completions\/?$/, ""));
                if (!open && health?.model) setModel(health.model);
                setOpen((o) => !o);
                setErr(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              title={t("Settings")}
              className={
                wake === "ready"
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-50"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-forge-400 px-2.5 py-1 text-xs font-medium text-forge-700 transition-colors hover:bg-forge-50"
              }
            >
              <SlidersIcon size={13} />
              {wake === "ready" ? <span className="hidden lg:inline">{t("Settings")}</span> : t("Connect to N-ATLAS")}
            </button>
          )}
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
              {t("Something not working? Run the setup doctor →")}
            </button>
          </div>
        </div>
      )}
      {connected && (
        <div className="border-t border-green-100 bg-green-50 px-6 py-2 text-xs text-green-700 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon size={12} /> {connected}
          </span>
        </div>
      )}
    </header>
  );
}

/** The mark: an "N" on Nigerian green, with a small launch spark. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-forge-400 via-forge-500 to-forge-700 font-extrabold text-white shadow-sm ring-1 ring-forge-700/20"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      N
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-white" />
    </span>
  );
}
