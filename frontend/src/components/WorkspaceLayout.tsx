import { useState, type ReactNode } from "react";
import { projectKind, projectName, useProject, useWorkspace } from "../state/ProjectContext";
import { nextStep, stages } from "../utils/projectStatus";

/**
 * The project workspace: a sidebar with the project's stages (open any of
 * them, see where each stands) and the current stage's screen beside it.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { state, dispatch } = useProject();
  const { setView, renameProject } = useWorkspace();
  const list = stages(state);
  const next = nextStep(state);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const kind = projectKind(state);

  function startRename() {
    setTitle(projectName(state));
    setEditing(true);
  }
  function saveRename() {
    renameProject(state.id, title);
    setEditing(false);
  }

  const nav = (compact: boolean) =>
    list.map((s) => {
      const active = s.steps.includes(state.step);
      return (
        <button
          key={s.key}
          disabled={!s.available}
          onClick={() => s.available && dispatch({ type: "setStep", step: s.step })}
          title={s.available ? undefined : "Design your app first"}
          className={[
            "group flex items-start gap-3 rounded-lg text-left transition-colors",
            compact ? "shrink-0 px-3 py-1.5" : "w-full px-3 py-2",
            active ? "bg-forge-50 text-forge-800" : s.available ? "text-slate-700 hover:bg-slate-100" : "cursor-not-allowed text-slate-300",
          ].join(" ")}
        >
          <span
            className={[
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              s.done ? "bg-forge-500 text-white" : active ? "border-2 border-forge-500 text-forge-600" : "border border-slate-300 text-slate-400",
            ].join(" ")}
            aria-hidden
          >
            {s.done ? "✓" : ""}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{s.label}</span>
            {!compact && <span className="block truncate text-[11px] text-slate-400">{s.detail}</span>}
          </span>
        </button>
      );
    });

  return (
    <div className="mx-auto flex max-w-[90rem] gap-6 px-4 lg:px-6">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col overflow-y-auto py-6 lg:flex">
        <button onClick={() => setView("home")} className="mb-4 text-left text-xs font-medium text-slate-400 hover:text-slate-600">
          ← My projects
        </button>

        {editing ? (
          <div className="mb-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={saveRename}
              className="w-full rounded-md border border-forge-400 px-2 py-1 text-base font-bold text-ink focus:outline-none"
            />
          </div>
        ) : (
          <button onClick={startRename} title="Rename project" className="group mb-1 text-left">
            <span className="text-base font-bold leading-snug text-ink">{projectName(state)}</span>
            <span className="ml-1 text-xs text-slate-300 opacity-0 group-hover:opacity-100">✎</span>
          </button>
        )}
        {kind && <span className="mb-4 text-xs text-slate-500">{kind}</span>}
        {!kind && <span className="mb-4 text-xs text-slate-400">New project</span>}

        <nav className="space-y-1">{nav(false)}</nav>

        {next && (
          <div className="mt-6 rounded-lg border border-forge-200 bg-forge-50/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-forge-700">Next step</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{next.text}</p>
            {!list.find((s) => s.steps.includes(next.step))?.steps.includes(state.step) && (
              <button
                onClick={() => dispatch({ type: "setStep", step: next.step })}
                className="mt-2 text-xs font-semibold text-forge-700 hover:underline"
              >
                Go →
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        {/* Stage tabs (mobile / tablet) */}
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white/70 px-4 py-2 lg:hidden">
          <button onClick={() => setView("home")} className="shrink-0 pr-2 text-xs text-slate-400">
            ←
          </button>
          {nav(true)}
        </div>
        {children}
      </div>
    </div>
  );
}
