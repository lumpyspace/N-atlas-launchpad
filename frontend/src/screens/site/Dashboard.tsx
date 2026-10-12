import { useT } from "../../i18n";
import { useProject, type Step } from "../../state/ProjectContext";
import { Card } from "../../ui";
import { ArrowRightIcon, CheckIcon, CopyIcon, ExternalIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { useSite } from "../../components/site/useSite";
import { timeAgo } from "../../utils/projectStatus";

/** The site's dashboard: at a glance, and what's left to do before (and after) publishing. */
export default function SiteDashboard() {
  const t = useT();
  const { dispatch } = useProject();
  const s = useSite();
  const go = (step: Step) => dispatch({ type: "setStep", step });
  const c = s.config;

  const todo: { done: boolean; title: string; detail: string; step: Step }[] = c
    ? [
        {
          done: s.unreviewed === 0,
          title: t("Check your pages"),
          detail: s.unreviewed ? t("{n} pages written by Groq are waiting for you to check them.", { n: s.unreviewed }) : t("Every page has been checked."),
          step: "pages",
        },
        {
          done: s.blanks === 0,
          title: t("Fill in your facts"),
          detail: s.blanks ? t("{n} places marked … need your real details (address, hours, payment…).", { n: s.blanks }) : t("No blanks left."),
          step: "pages",
        },
        ...(c.blocks.prices.on
          ? [
              {
                done: c.blocks.prices.items.length > 0 && c.blocks.prices.items.every((i) => i.price != null),
                title: t("Set your prices"),
                detail: t("{n} items without a price.", { n: c.blocks.prices.items.filter((i) => i.price == null).length }),
                step: "plugins" as Step,
              },
            ]
          : []),
        ...(c.blocks.contact.on
          ? [{ done: !!(c.blocks.contact.whatsapp || c.blocks.contact.phone), title: t("Add your WhatsApp or phone"), detail: t("So visitors can reach a person."), step: "plugins" as Step }]
          : []),
        { done: true, title: t("Choose a look"), detail: t("Theme: {theme}", { theme: c.theme.id }), step: "appearance" },
        ...((c.languages ?? []).length
          ? [
              {
                done: s.untranslated.length === 0,
                title: t("Translate your site"),
                detail: s.untranslated.length
                  ? t("{n} languages need translating (new, or your pages changed).", { n: s.untranslated.length })
                  : t("Every language is up to date."),
                step: "settings" as Step,
              },
            ]
          : []),
        { done: s.live && !s.changed, title: s.live ? t("Publish your changes") : t("Publish your site"), detail: s.live ? (s.changed ? t("You have changes visitors can't see yet.") : t("Everything is live.")) : t("One click gives it a link anyone can open."), step: "site" },
      ]
    : [];

  return (
    <SiteFrame title={t("Dashboard")} subtitle={t("Your website, with the N-ATLAS assistant on every page. Manage it all here.")}>
      {c && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900">{t("Next steps")}</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {todo.map((item) => (
                <li key={item.title} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.done ? "bg-forge-500 text-white" : "border-2 border-slate-300"}`}>
                    {item.done && <CheckIcon size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${item.done ? "text-slate-400" : "text-slate-800"}`}>{item.title}</span>
                    <span className="block text-xs text-slate-500">{item.detail}</span>
                  </span>
                  {!item.done && item.step !== "site" && (
                    <button onClick={() => go(item.step)} className="inline-flex items-center gap-1 text-xs font-semibold text-forge-700 hover:underline">
                      {t("Go")} <ArrowRightIcon size={12} />
                    </button>
                  )}
                  {!item.done && item.step === "site" && s.status?.canPublish && (
                    <button onClick={s.publish} disabled={s.busy} className="rounded-lg bg-forge-500 px-3 py-1 text-xs font-semibold text-white hover:bg-forge-600">
                      {s.live ? t("Update") : t("Publish")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="font-semibold text-slate-900">{t("At a glance")}</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row k={t("Pages")} v={String(c.pages.length)} onClick={() => go("pages")} />
                <Row k={t("Active plugins")} v={String([c.blocks.assistant.on, c.blocks.prices.on, c.blocks.orders.on, c.blocks.contact.on, c.blocks.info.on].filter(Boolean).length)} onClick={() => go("plugins")} />
                <Row k={t("Theme")} v={c.theme.id} onClick={() => go("appearance")} />
                <Row k={t("Status")} v={s.live ? (s.changed ? t("Live, with unpublished changes") : t("Live")) : t("Draft")} />
                {s.site?.publishedAt && <Row k={t("Published")} v={timeAgo(s.site.publishedAt, t)} />}
              </dl>
            </Card>
            {s.live && (
              <Card className="p-5">
                <h2 className="font-semibold text-slate-900">{t("Your site's address")}</h2>
                <a href={s.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 break-all font-mono text-xs font-semibold text-forge-700 hover:underline">
                  {s.link} <ExternalIcon size={11} />
                </a>
                <button onClick={() => navigator.clipboard?.writeText(s.link).catch(() => {})} className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <CopyIcon size={12} /> {t("Copy link")}
                </button>
                <p className="mt-2 text-xs text-slate-400">{t("Share it on WhatsApp, Instagram or a poster.")}</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </SiteFrame>
  );
}

function Row({ k, v, onClick }: { k: string; v: string; onClick?: () => void }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd>{onClick ? <button onClick={onClick} className="font-medium capitalize text-forge-700 hover:underline">{v}</button> : <span className="font-medium capitalize text-slate-800">{v}</span>}</dd>
    </div>
  );
}
