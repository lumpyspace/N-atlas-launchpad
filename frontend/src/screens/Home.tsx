import { useState } from "react";
import { ModeSwitch } from "../components/ModeSwitch";
import { LANGUAGES, useT } from "../i18n";
import { projectKind, projectName, useWorkspace, type Project } from "../state/ProjectContext";
import { Button, Card } from "../ui";
import { nextStep, stages, timeAgo } from "../utils/projectStatus";

/** My projects: every app you're building, where each stands, and what's next. */
export default function Home() {
  const { workspace, newProject } = useWorkspace();
  const t = useT();
  const projects = workspace.order.map((id) => workspace.projects[id]).filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("My projects")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("Every N-ATLAS app you're building — pick up where you left off, or start something new.")}
          </p>
          <ModeSwitch className="mt-3" />
        </div>
        <Button onClick={newProject}>{t("+ New project")}</Button>
      </div>

      {projects.length === 0 ? (
        <Card className="mt-8 p-10 text-center">
          <div className="text-4xl">🚀</div>
          <h2 className="mt-3 text-lg font-semibold text-slate-800">{t("No projects yet")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {t(
              "Describe an idea in your own words and Launchpad will help you design, build, test, secure and ship it on N-ATLAS.",
            )}
          </p>
          <Button className="mt-5" onClick={newProject}>
            {t("Start your first project")}
          </Button>
        </Card>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
          <button
            onClick={newProject}
            className="flex min-h-[12rem] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 transition-colors hover:border-forge-400 hover:text-forge-700"
          >
            <span className="text-2xl">+</span>
            <span className="mt-1 text-sm font-medium">{t("New project")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const { openProject, renameProject, duplicateProject, deleteProject, mode } = useWorkspace();
  const t = useT();
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = stages(p, t, mode);
  const next = nextStep(p, t, mode);
  const kind = projectKind(p);
  const idea = p.design.answers.idea || p.description;
  const lang = LANGUAGES.find((l) => l.code === p.language);

  return (
    <Card className="relative flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => openProject(p.id)} className="min-w-0 text-left">
          <div className="truncate text-base font-bold text-ink hover:text-forge-700">{projectName(p)}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {kind && <>{t(kind)} · </>}
            <span title={t("This project's language")}>🌍 {lang?.native ?? "English"}</span>
          </div>
        </button>
        <button
          onClick={() => {
            setMenu((m) => !m);
            setConfirmDelete(false);
          }}
          className="rounded-md px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={t("Project actions")}
        >
          ⋯
        </button>
        {menu && (
          <div className="absolute right-4 top-12 z-10 w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
            <MenuItem
              onClick={() => {
                const title = window.prompt(t("Rename project"), projectName(p));
                if (title !== null) renameProject(p.id, title);
                setMenu(false);
              }}
            >
              {t("Rename")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                duplicateProject(p.id);
                setMenu(false);
              }}
            >
              {t("Duplicate")}
            </MenuItem>
            {confirmDelete ? (
              <MenuItem danger onClick={() => deleteProject(p.id)}>
                {t("Click again to delete")}
              </MenuItem>
            ) : (
              <MenuItem danger onClick={() => setConfirmDelete(true)}>
                {t("Delete…")}
              </MenuItem>
            )}
          </div>
        )}
      </div>

      {idea && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{idea}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {list.map((s) => (
          <span
            key={s.key}
            title={s.detail}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              s.done ? "border-forge-200 bg-forge-50 text-forge-700" : "border-slate-200 text-slate-400"
            }`}
          >
            {s.done ? "✓" : "○"} {s.label}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        {next && (
          <p className="text-xs text-slate-500">
            {t("Next:")} {next.text}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t("Updated {when}", { when: timeAgo(p.updatedAt, t) })}</span>
          <Button size="sm" variant="secondary" onClick={() => openProject(p.id)}>
            {t("Open →")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MenuItem({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-slate-50 ${danger ? "text-red-600" : "text-slate-700"}`}
    >
      {children}
    </button>
  );
}
