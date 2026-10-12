import { useState } from "react";
import { LANGUAGES, useT } from "../../i18n";
import { Badge, Button, Card, Spinner } from "../../ui";
import { CopyIcon, ExternalIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { input } from "../../components/site/editors";
import { translationState, useSite } from "../../components/site/useSite";

/** Settings — General (title, tagline, language), the site's address and edit key, and taking it offline. */
export default function SiteSettings() {
  const t = useT();
  const s = useSite();
  const [copied, setCopied] = useState<string | null>(null);
  const c = s.config;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <SiteFrame title={t("Settings")}>
      {c && (
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold text-slate-900">{t("General")}</h2>
            <label className="block text-xs font-medium text-slate-600">
              {t("Site title")}
              <input value={c.name} maxLength={80} onChange={(e) => s.setConfig((cfg) => ({ ...cfg, name: e.target.value }))} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("Tagline")}
              <input value={c.tagline} maxLength={200} onChange={(e) => s.setConfig((cfg) => ({ ...cfg, tagline: e.target.value }))} className={`${input} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("Main language")}
              <select
                value={c.language}
                onChange={(e) => s.setConfig((cfg) => ({ ...cfg, language: e.target.value, languages: (cfg.languages ?? []).filter((l) => l !== e.target.value) }))}
                className={`${input} mt-1`}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-slate-400">{t("The language you write your pages in. The assistant answers each visitor in the language they write in.")}</span>
            </label>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold text-slate-900">{t("Languages visitors can choose")}</h2>
            <p className="text-xs text-slate-500">
              {t("Visitors get a language menu at the top of your site. Your pages, posts and the assistant's greeting are translated by N-ATLAS (Groq helps with tricky lines) — check them if you can, then publish.")}
            </p>
            <ul className="divide-y divide-slate-100">
              {LANGUAGES.filter((l) => l.code !== c.language).map((l) => {
                const on = (c.languages ?? []).includes(l.code);
                const state = translationState(c, l.code);
                const busy = s.translating.includes(l.code);
                return (
                  <li key={l.code} className="flex flex-wrap items-center gap-3 py-2.5">
                    <label className="flex min-w-[10rem] items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          s.setConfig((cfg) => ({
                            ...cfg,
                            languages: e.target.checked ? [...(cfg.languages ?? []), l.code] : (cfg.languages ?? []).filter((x) => x !== l.code),
                          }))
                        }
                      />
                      {l.native}
                    </label>
                    {on && (
                      <>
                        {busy ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                            <Spinner className="h-3 w-3" /> {t("Translating…")}
                          </span>
                        ) : state === "ready" ? (
                          <Badge tone="green">{t("Translated")}</Badge>
                        ) : state === "stale" ? (
                          <Badge tone="amber">{t("Needs updating: your pages changed")}</Badge>
                        ) : (
                          <Badge>{t("Not translated yet")}</Badge>
                        )}
                        {!busy && (
                          <button onClick={() => s.translate(l.code)} className="text-xs font-semibold text-forge-700 hover:underline">
                            {state === "ready" ? t("Translate again") : t("Translate now")}
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {s.live && s.site?.ownerKey && (
            <Card className="space-y-3 p-5">
              <h2 className="font-semibold text-slate-900">{t("Address & edit key")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-sm font-semibold text-forge-700 hover:underline">
                  {s.link} <ExternalIcon size={12} />
                </a>
                <button onClick={() => copy(s.link, "link")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <CopyIcon size={12} /> {copied === "link" ? t("Copied") : t("Copy link")}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {t("There's no account: your edit key is what lets you update your site, read its inbox or take it offline. It's saved in this browser — copy it somewhere safe in case you clear your browser.")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{s.site.ownerKey}</code>
                <button onClick={() => copy(s.site!.ownerKey!, "key")} className="inline-flex items-center gap-1 text-xs font-medium text-forge-700 hover:underline">
                  <CopyIcon size={12} /> {copied === "key" ? t("Copied") : t("Copy")}
                </button>
              </div>
            </Card>
          )}

          <Card className="space-y-3 border-red-100 p-5">
            <h2 className="font-semibold text-slate-900">{t("Start over or take it down")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={s.busy}
                onClick={() => window.confirm(t("Create the site again from your plan? Your pages, theme and plugin settings will be replaced.")) && s.create()}
              >
                {t("Create the site again from my plan")}
              </Button>
              {s.live && (
                <Button
                  variant="danger"
                  disabled={s.busy}
                  onClick={() => window.confirm(t("Take your site offline? Its link will stop working and its inbox will be deleted.")) && s.unpublish()}
                >
                  {t("Take it offline")}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </SiteFrame>
  );
}
