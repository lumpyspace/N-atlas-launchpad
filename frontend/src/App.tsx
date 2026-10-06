import { useEffect, useState } from "react";
import { getHealth, type HealthStatus } from "./api";
import EvaluationDashboard from "./components/EvaluationDashboard";
import Playground from "./components/Playground";

/**
 * N-ATLAS Forge shell.
 *
 * Two views under a persistent REAL-vs-MOCK provider banner:
 *   - Evaluate   : run scored test suites against N-ATLAS (the core product).
 *   - Playground : ad-hoc single-prompt probing.
 */
type Tab = "evaluate" | "playground";

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [tab, setTab] = useState<Tab>("evaluate");

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">N-ATLAS Forge</h1>
        <p className="text-slate-500">Build. Test. Benchmark. Improve.</p>
      </header>

      {/* Provider-mode banner — the single most important bit of honesty in the UI. */}
      <ProviderBanner health={health} />

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "evaluate"} onClick={() => setTab("evaluate")}>
          Evaluate
        </TabButton>
        <TabButton active={tab === "playground"} onClick={() => setTab("playground")}>
          Playground
        </TabButton>
      </nav>

      {tab === "evaluate" ? <EvaluationDashboard /> : <Playground />}

      <footer className="mt-6 text-center text-xs text-slate-400">
        N-ATLAS Forge · evaluation dashboard. Mock runs are always flagged as not
        real N-ATLAS.
      </footer>
    </div>
  );
}

function TabButton({
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
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-forge-500 text-forge-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function ProviderBanner({ health }: { health: HealthStatus | null }) {
  if (!health) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm text-slate-500">
        Checking backend health…
      </div>
    );
  }
  if (health.isMock) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>MOCK MODE.</strong> The backend is returning placeholder text, not
        real N-ATLAS output. Configure <code>NATLAS_PROVIDER=http</code> and{" "}
        <code>NATLAS_ENDPOINT</code> to connect the real model.
      </div>
    );
  }
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        health.ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      <strong>REAL N-ATLAS.</strong> {health.detail} (model: {health.model})
    </div>
  );
}
