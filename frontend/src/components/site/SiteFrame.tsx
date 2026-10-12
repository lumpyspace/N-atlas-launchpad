import { useEffect, type ReactNode } from "react";
import { useT } from "../../i18n";
import { useProject } from "../../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../../ui";
import { ExternalIcon, GlobeIcon, SparklesIcon } from "../../ui/icons";
import { useSite } from "./useSite";

/**
 * Every site admin screen sits in this frame: the admin bar (site name, Draft /
 * Live, View site, Publish or Update) like WordPress's, and — before the site
 * exists — the button that creates it.
 */
export function SiteFrame({ title, subtitle, actions, children, wide = false }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const { state, dispatch } = useProject();
  const s = useSite();

  // First visit: Groq creates the site from the plan.
  useEffect(() => {
    if (!state.blueprint || s.site) return;
    const ctrl = new AbortController();
    s.create(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.blueprint?.name]);

  if (!state.blueprint) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">
          {t("Describe your idea first — your site is made from your plan.")}{" "}
          <button onClick={() => dispatch({ type: "setStep", step: "describe" })} className="font-semibold text-forge-700 hover:underline">
            {t("Describe it →")}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`mx-auto ${wide ? "max-w-7xl" : "max-w-5xl"} px-6 py-6`}>
      {/* The admin bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-card">
        <div className="flex min-w-0 items-center gap-2">
          <GlobeIcon size={16} className="text-forge-600" />
          <span className="truncate font-semibold text-ink">{s.config?.name ?? state.blueprint.name}</span>
          {s.site &&
            (s.live ? (
              s.changed ? (
                <Badge tone="amber">{t("Changes not published")}</Badge>
              ) : (
                <Badge tone="green">{t("Live")}</Badge>
              )
            ) : (
              <Badge>{t("Draft")}</Badge>
            ))}
        </div>
        {s.site && (
          <div className="flex flex-wrap items-center gap-2">
            {s.live && (
              <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                {t("View site")} <ExternalIcon size={12} />
              </a>
            )}
            {s.status?.canPublish && (!s.live || s.changed) && (
              <Button size="sm" onClick={s.publish} disabled={s.busy}>
                {s.busy ? <Spinner className="h-3.5 w-3.5" /> : null}
                {s.live ? t("Update") : t("Publish")}
              </Button>
            )}
          </div>
        )}
      </div>
      {s.error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{s.error}</div>}
      {s.status && !s.status.canPublish && s.site && (
        <p className="mt-2 text-xs text-slate-500">{t("Publishing isn't switched on for this Launchpad yet: it needs a database. You can still build and preview your site.")}</p>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>

      <div className="mt-5">
        {s.site ? (
          children
        ) : (
          <Card className="flex items-center gap-3 p-8 text-slate-600">
            {s.busy ? (
              <>
                <Spinner className="h-4 w-4 text-forge-600" /> {t("Groq is creating your site from your plan: pages, a theme and plugins…")}
              </>
            ) : (
              <Button onClick={() => s.create()}>
                <SparklesIcon size={14} /> {t("Create my site")}
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
