import { useState } from "react";
import { previewSite, viewOf, type ThemeId } from "../../api";
import { N_, useT } from "../../i18n";
import { Card } from "../../ui";
import { CheckIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { SiteView } from "../../components/site/SiteView";
import { publishable, useSite } from "../../components/site/useSite";

const THEMES: { id: ThemeId; name: string; blurb: string; bg: string; surface: string; text: string; accent: string }[] = [
  { id: "market", name: N_("Market"), blurb: N_("Bold banner, friendly and busy."), bg: "#f6faf7", surface: "#ffffff", text: "#10231a", accent: "#0f9d58" },
  { id: "clean", name: N_("Clean"), blurb: N_("Light, calm and professional."), bg: "#ffffff", surface: "#f8fafc", text: "#0f172a", accent: "#2563eb" },
  { id: "warm", name: N_("Warm"), blurb: N_("Rounded, sunny and welcoming."), bg: "#fffaf3", surface: "#ffffff", text: "#2b1d0e", accent: "#ea580c" },
  { id: "night", name: N_("Night"), blurb: N_("Dark and striking."), bg: "#0b1220", surface: "#111a2e", text: "#e5e7eb", accent: "#22c55e" },
];

const SWATCHES = ["#0f9d58", "#15803d", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#0891b2", "#334155"];

/** Appearance — Themes and Customize, with the whole site in a live preview. */
export default function SiteAppearance() {
  const t = useT();
  const s = useSite();
  const [page, setPage] = useState("");
  const c = s.config;
  return (
    <SiteFrame wide title={t("Appearance")} subtitle={t("Pick a theme and a colour. The preview is your real site: click the menu, try the chat.")}>
      {c && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">{t("Theme")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {THEMES.map((th) => {
                  const on = c.theme.id === th.id;
                  return (
                    <button
                      key={th.id}
                      onClick={() => s.setConfig((cfg) => ({ ...cfg, theme: { id: th.id, accent: cfg.theme.id === th.id ? cfg.theme.accent : th.accent } }))}
                      className={`overflow-hidden rounded-lg border-2 text-left transition-colors ${on ? "border-forge-500" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="h-14 p-2" style={{ background: th.bg }}>
                        <div className="h-3 w-3/4 rounded" style={{ background: th.accent }} />
                        <div className="mt-1.5 h-2 w-1/2 rounded" style={{ background: th.text, opacity: 0.4 }} />
                        <div className="mt-1 h-2 w-2/3 rounded" style={{ background: th.surface === "#ffffff" ? "#e2e8f0" : th.surface }} />
                      </div>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-xs font-semibold text-slate-800">{t(th.name)}</span>
                        {on && <CheckIcon size={12} className="text-forge-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">{t(THEMES.find((x) => x.id === c.theme.id)?.blurb ?? "")}</p>
            </Card>
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">{t("Colour")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => s.setConfig((cfg) => ({ ...cfg, theme: { ...cfg.theme, accent: hex } }))}
                    className={`h-7 w-7 rounded-full ring-offset-2 ${c.theme.accent === hex ? "ring-2 ring-slate-800" : ""}`}
                    style={{ background: hex }}
                    aria-label={hex}
                  />
                ))}
                <label className="flex h-7 items-center gap-1 rounded-full border border-slate-200 px-2 text-xs text-slate-500">
                  <input type="color" value={c.theme.accent} onChange={(e) => s.setConfig((cfg) => ({ ...cfg, theme: { ...cfg.theme, accent: e.target.value } }))} className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" />
                  {t("Custom")}
                </label>
              </div>
            </Card>
          </div>
          <div>
            <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-slate-200 bg-slate-100 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-forge-400" />
              <span className="ml-2 truncate rounded bg-white px-2 py-0.5 font-mono text-[11px] text-slate-500">{s.link || `…/a/${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}{page ? `/${page}` : ""}</span>
            </div>
            <div className="h-[40rem] overflow-y-auto rounded-b-xl border border-slate-200 shadow-card">
              <SiteView site={viewOf(c)} page={page} onNavigate={setPage} chat={(h, sent) => previewSite(publishable(c), h, sent)} contained showBlanks />
            </div>
          </div>
        </div>
      )}
    </SiteFrame>
  );
}
