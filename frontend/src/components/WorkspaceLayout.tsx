import { useState, type ReactNode } from "react";
import { projectKind, projectName, useProject, useWorkspace } from "../state/ProjectContext";
import { hostOf, isLive, nextStep, stages, type StageKey } from "../utils/projectStatus";
import type { Step } from "../state/ProjectContext";
import { N_ } from "../i18n";
import { useT } from "../i18n";
import { ModeSwitch } from "./ModeSwitch";
import {
  ArrowRightIcon,
  BookIcon,
  ChatIcon,
  CheckIcon,
  ExternalIcon,
  FlaskIcon,
  LayersIcon,
  PackageIcon,
  PenIcon,
  RocketIcon,
  SlidersIcon,
  GlobeIcon,
} from "../ui/icons";

/** The site's admin menu, WordPress-style. */
const SITE_MENU: { step: Step; label: string; icon: typeof ChatIcon }[] = [
  { step: "site", label: N_("Dashboard"), icon: GlobeIcon },
  { step: "pages", label: N_("Pages"), icon: LayersIcon },
  { step: "appearance", label: N_("Appearance"), icon: PenIcon },
  { step: "plugins", label: N_("Plugins"), icon: SlidersIcon },
  { step: "inbox", label: N_("Inbox"), icon: PackageIcon },
  { step: "settings", label: N_("Settings"), icon: BookIcon },
];

const STAGE_ICON: Record<StageKey, typeof ChatIcon> = {
  design: ChatIcon,
  build: LayersIcon,
  prompt: PenIcon,
  knowledge: BookIcon,
  site: GlobeIcon,
  test: FlaskIcon,
  ship: PackageIcon,
  live: RocketIcon,
};

/**
 * The project workspace: a sidebar with the project's stages (open any of
 * them, see where each stands) and the current stage's screen beside it.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { state, dispatch } = useProject();
  const { setView, renameProject, mode } = useWorkspace();
  const t = useT();
  const list = stages(state, t, mode);
  const next = nextStep(state, t, mode);
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

  const doneCount = list.filter((s) => s.done).length;
  const live = isLive(state) ? state.goLive!.check!.url : null;

  const nav = (compact: boolean) =>
    list.map((s) => {
      const active = s.steps.includes(state.step);
      const Icon = STAGE_ICON[s.key];
      const button = (
        <button
          key={s.key}
          disabled={!s.available}
          onClick={() => s.available && dispatch({ type: "setStep", step: s.step })}
          title={s.available ? undefined : t("Design your app first")}
          className={[
            "group flex items-start gap-3 rounded-lg text-left transition-colors",
            compact ? "shrink-0 px-3 py-1.5" : "w-full px-3 py-2",
            active ? "bg-forge-50 text-forge-800" : s.available ? "text-slate-700 hover:bg-slate-100" : "cursor-not-allowed text-slate-300",
          ].join(" ")}
        >
          <span
            className={[
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
              s.done ? "bg-forge-500 text-white" : active ? "bg-white text-forge-600 ring-2 ring-forge-500" : s.available ? "bg-slate-100 text-slate-500" : "bg-slate-50 text-slate-300",
            ].join(" ")}
            aria-hidden
          >
            {s.done ? <CheckIcon size={13} /> : <Icon size={13} />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{s.label}</span>
            {!compact && <span className="block truncate text-[11px] text-slate-400">{s.detail}</span>}
          </span>
        </button>
      );
      // Under "Your site": its admin menu, once you're in it.
      if (s.key !== "site" || !active) return button;
      if (compact) {
        // Narrow screens: the site's menu follows in the tab row.
        return [
          button,
          ...SITE_MENU.map((m) => (
            <button
              key={`menu-${m.step}`}
              onClick={() => dispatch({ type: "setStep", step: m.step })}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-sm ${state.step === m.step ? "bg-forge-50 font-semibold text-forge-800" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {t(m.label)}
            </button>
          )),
        ];
      }
      return (
        <div key={s.key}>
          {button}
          <div className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
            {SITE_MENU.map((m) => (
              <button
                key={m.step}
                onClick={() => dispatch({ type: "setStep", step: m.step })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
                  state.step === m.step ? "bg-forge-50 font-semibold text-forge-800" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <m.icon size={13} className={state.step === m.step ? "text-forge-600" : "text-slate-400"} />
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div className="mx-auto flex max-w-[90rem] gap-6 px-4 lg:px-6">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col overflow-y-auto py-6 lg:flex">
        <button onClick={() => setView("home")} className="mb-4 text-left text-xs font-medium text-slate-400 hover:text-slate-600">
          ← {t("My projects")}
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
          <button onClick={startRename} title={t("Rename project")} className="group mb-1 text-left">
            <span className="text-base font-bold leading-snug text-ink">{projectName(state)}</span>
            <span className="ml-1 text-xs text-slate-300 opacity-0 group-hover:opacity-100">✎</span>
          </button>
        )}
        {kind && <span className="text-xs text-slate-500">{t(kind)}</span>}
        {!kind && <span className="text-xs text-slate-400">{t("New project")}</span>}

        <div className="mb-4 mt-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>{t("{done} of {total} done", { done: doneCount, total: list.length })}</span>
            {live && (
              <a href={live} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-forge-700 hover:underline">
                <span className="h-1.5 w-1.5 rounded-full bg-forge-500" /> {hostOf(live)} <ExternalIcon size={10} />
              </a>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-forge-400 to-forge-600 transition-all" style={{ width: `${(doneCount / list.length) * 100}%` }} />
          </div>
        </div>

        <nav className="space-y-0.5">{nav(false)}</nav>

        <div className="mt-4">
          <ModeSwitch />
        </div>

        {next && (
          <div className="mt-6 rounded-xl border border-forge-200 bg-gradient-to-br from-forge-50 to-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-forge-700">{t("Next step")}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{next.text}</p>
            {!list.find((s) => s.steps.includes(next.step))?.steps.includes(state.step) && (
              <button
                onClick={() => dispatch({ type: "setStep", step: next.step })}
                className="mt-2 text-xs font-semibold text-forge-700 hover:underline"
              >
                <span className="inline-flex items-center gap-1">
                  {t("Go")} <ArrowRightIcon size={12} />
                </span>
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
