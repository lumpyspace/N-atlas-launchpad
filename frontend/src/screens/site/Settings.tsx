import { useState } from "react";
import { LANGUAGES, useT } from "../../i18n";
import { Button, Card } from "../../ui";
import { CopyIcon, ExternalIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { input } from "../../components/site/editors";
import { useSite } from "../../components/site/useSite";

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
              {t("Site language")}
              <select value={c.language} onChange={(e) => s.setConfig((cfg) => ({ ...cfg, language: e.target.value }))} className={`${input} mt-1`}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-slate-400">{t("The language of the site's buttons. The assistant answers each visitor in the language they write in.")}</span>
            </label>
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
