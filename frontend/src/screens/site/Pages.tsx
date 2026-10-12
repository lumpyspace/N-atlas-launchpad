import { useState } from "react";
import { previewSite, viewOf, type Page, type Section } from "../../api";
import { LANGUAGES, useT } from "../../i18n";
import { Badge, Button, Card } from "../../ui";
import { ArrowRightIcon, CheckIcon, XIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { SiteView } from "../../components/site/SiteView";
import { input } from "../../components/site/editors";
import { publishable, useSite } from "../../components/site/useSite";

const SECTION_LABEL: Record<Section["type"], string> = {
  hero: "Banner",
  text: "Text",
  faq: "Questions & answers",
  prices: "Price list",
  contact: "Contact",
  posts: "Latest posts",
};

const NEW_SECTION: Record<Section["type"], Section> = {
  hero: { type: "hero", heading: "", text: "", button: "chat" },
  text: { type: "text", heading: "", text: "" },
  faq: { type: "faq", heading: "Questions", items: [{ q: "", a: "" }] },
  prices: { type: "prices", heading: "Our prices" },
  contact: { type: "contact", heading: "Talk to us" },
  posts: { type: "posts", heading: "Latest news", count: 6 },
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Pages — WordPress's Pages screen: the list, and an editor with a live preview. */
export default function SitePages() {
  const t = useT();
  const s = useSite();
  const [editing, setEditing] = useState<string | null>(null);
  // Which language's version of the page is being edited ("" = the main language).
  const [inLang, setInLang] = useState("");
  const c = s.config;
  const mainPage = c?.pages.find((p) => p.id === editing);
  const trPage = inLang ? c?.translations?.[inLang]?.pages.find((p) => p.id === editing) : undefined;
  const page = trPage ?? mainPage;
  const translated = (c?.languages ?? []).filter((l) => c?.translations?.[l]?.pages.some((p) => p.id === editing));

  const setPages = (f: (pages: Page[]) => Page[]) => s.setConfig((cfg) => ({ ...cfg, pages: f(cfg.pages) }));
  const setPage = (id: string, patch: Partial<Page>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** A change to the page in the language being edited (a translation's edits don't change the original). */
  const changePage = (id: string, patch: Partial<Page>) => {
    if (!trPage) return setPage(id, patch);
    s.setConfig((cfg) => {
      const tr = cfg.translations?.[inLang];
      if (!tr) return cfg;
      return { ...cfg, translations: { ...cfg.translations, [inLang]: { ...tr, pages: tr.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) } } };
    });
  };

  if (page && c && mainPage) {
    return (
      <SiteFrame
        wide
        title={t("Edit page: {title}", { title: page.title })}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => (setEditing(null), setInLang(""))}>
              ← {t("All pages")}
            </Button>
            {!mainPage.reviewed && (
              <Button onClick={() => setPage(mainPage.id, { reviewed: true })}>
                <CheckIcon size={14} /> {t("Looks right")}
              </Button>
            )}
          </div>
        }
      >
        {translated.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-xs text-slate-500">{t("Editing in:")}</span>
            {["", ...translated].map((l) => (
              <button
                key={l || "main"}
                onClick={() => setInLang(l)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${inLang === l ? "bg-forge-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {LANGUAGES.find((x) => x.code === (l || c.language))?.native ?? l}
              </button>
            ))}
            {inLang && <span className="ml-2 text-xs text-slate-400">{t("Fix the translation here. “Translate again” in Settings would replace your fixes.")}</span>}
          </div>
        )}
        <PageEditor page={page} isHome={c.pages[0].id === page.id} translation={!!trPage} onChange={(patch) => changePage(page.id, patch)} />
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Live preview")}</h2>
          <div className="h-[36rem] overflow-y-auto rounded-xl border border-slate-200 shadow-card">
            <SiteView site={viewOf(c)} page={page.slug} language={inLang || c.language} onNavigate={() => {}} chat={(h, sent, lang) => previewSite(publishable(c), h, sent, lang)} contained showBlanks />
          </div>
        </div>
      </SiteFrame>
    );
  }

  return (
    <SiteFrame
      title={t("Pages")}
      subtitle={t("Your site's pages. The assistant knows everything they say — so does every visitor.")}
      actions={
        c && (
          <Button
            onClick={() => {
              const id = Math.random().toString(36).slice(2, 10);
              setPages((ps) => [...ps, { id, title: t("New page"), slug: `page-${ps.length + 1}`, inMenu: true, reviewed: true, sections: [NEW_SECTION.text] }]);
              setEditing(id);
            }}
          >
            + {t("Add new page")}
          </Button>
        )
      }
    >
      {c && (
        <>
          {s.unreviewed > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("Groq wrote these pages from your plan. Check each one: it may have guessed details about your business. Fix anything that's wrong, fill in every …, then press “Looks right”.")}
            </div>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t("Title")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("Address")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("Status")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("In menu")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.pages.map((p, i) => (
                  <tr key={p.id} className="group">
                    <td className="px-4 py-3">
                      <button onClick={() => setEditing(p.id)} className="font-semibold text-forge-700 hover:underline">
                        {p.title}
                      </button>
                      {i === 0 && <span className="ml-2 text-xs text-slate-400">— {t("Home page")}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">/{p.slug}</td>
                    <td className="px-4 py-3">{p.reviewed ? <Badge tone="green">{t("Checked")}</Badge> : <Badge tone="amber">{t("Draft by Groq — check it")}</Badge>}</td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={p.inMenu} onChange={(e) => setPage(p.id, { inMenu: e.target.checked })} aria-label={t("In menu")} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                      <button disabled={i === 0} onClick={() => setPages((ps) => swap(ps, i, i - 1))} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t("Move up")}>
                        ↑
                      </button>
                      <button disabled={i === c.pages.length - 1} onClick={() => setPages((ps) => swap(ps, i, i + 1))} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t("Move down")}>
                        ↓
                      </button>
                      {i > 0 && (
                        <button
                          onClick={() => window.confirm(t("Delete the page “{title}”?", { title: p.title })) && setPages((ps) => ps.filter((x) => x.id !== p.id))}
                          className="ml-2 text-red-500 hover:underline"
                        >
                          {t("Delete")}
                        </button>
                      )}
                      <button onClick={() => setEditing(p.id)} className="ml-3 inline-flex items-center gap-1 font-semibold text-forge-700 hover:underline">
                        {t("Edit")} <ArrowRightIcon size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </SiteFrame>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const out = [...list];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

function PageEditor({ page, isHome, translation = false, onChange }: { page: Page; isHome: boolean; translation?: boolean; onChange: (patch: Partial<Page>) => void }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const setSection = (i: number, s: Section) => onChange({ sections: page.sections.map((x, j) => (j === i ? s : x)) });

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          {t("Page title (shown in the menu)")}
          <input value={page.title} maxLength={60} onChange={(e) => onChange({ title: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t("Address")}
          <div className="mt-1 flex items-center gap-1">
            <span className="font-mono text-xs text-slate-400">/</span>
            <input
              value={page.slug}
              disabled={isHome || translation}
              maxLength={40}
              onChange={(e) => onChange({ slug: slugify(e.target.value) })}
              className={`${input} font-mono disabled:bg-slate-50`}
              placeholder={isHome ? t("(home page)") : ""}
            />
          </div>
        </label>
      </Card>

      {page.sections.map((sec, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-forge-700">{t(SECTION_LABEL[sec.type])}</span>
            {!translation && <span className="flex items-center gap-1 text-xs">
              <button disabled={i === 0} onClick={() => onChange({ sections: swap(page.sections, i, i - 1) })} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t("Move up")}>
                ↑
              </button>
              <button disabled={i === page.sections.length - 1} onClick={() => onChange({ sections: swap(page.sections, i, i + 1) })} className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t("Move down")}>
                ↓
              </button>
              <button onClick={() => onChange({ sections: page.sections.filter((_, j) => j !== i) })} className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={t("Remove")}>
                <XIcon size={13} />
              </button>
            </span>}
          </div>
          <SectionEditor section={sec} onChange={(s) => setSection(i, s)} />
        </Card>
      ))}

      {!translation && <div>
        {adding ? (
          <Card className="flex flex-wrap gap-2 p-3">
            {(Object.keys(NEW_SECTION) as Section["type"][]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  onChange({ sections: [...page.sections, NEW_SECTION[type]] });
                  setAdding(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-forge-400 hover:text-forge-700"
              >
                {t(SECTION_LABEL[type])}
              </button>
            ))}
            <button onClick={() => setAdding(false)} className="px-2 text-xs text-slate-400">
              {t("Cancel")}
            </button>
          </Card>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 hover:border-forge-300 hover:text-forge-700">
            + {t("Add a section")}
          </button>
        )}
      </div>}
    </div>
  );
}

function SectionEditor({ section: s, onChange }: { section: Section; onChange: (s: Section) => void }) {
  const t = useT();
  const heading = (
    <label className="mt-2 block text-xs font-medium text-slate-600">
      {t("Heading")}
      <input value={s.heading} maxLength={120} onChange={(e) => onChange({ ...s, heading: e.target.value } as Section)} className={`${input} mt-1`} />
    </label>
  );
  switch (s.type) {
    case "hero":
      return (
        <>
          {heading}
          <label className="mt-2 block text-xs font-medium text-slate-600">
            {t("Text")}
            <textarea value={s.text} rows={2} maxLength={600} onChange={(e) => onChange({ ...s, text: e.target.value })} className={`${input} mt-1`} />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-600">
            {t("Button")}
            <select value={s.button} onChange={(e) => onChange({ ...s, button: e.target.value as typeof s.button })} className={`${input} mt-1`}>
              <option value="chat">{t("Ask us anything (opens the assistant)")}</option>
              <option value="order">{t("Order now (starts an order with the assistant)")}</option>
              <option value="whatsapp">{t("Chat on WhatsApp")}</option>
              <option value="none">{t("No button")}</option>
            </select>
          </label>
        </>
      );
    case "text":
      return (
        <>
          {heading}
          <label className="mt-2 block text-xs font-medium text-slate-600">
            {t("Text")}
            <textarea value={s.text} rows={5} maxLength={6000} onChange={(e) => onChange({ ...s, text: e.target.value })} className={`${input} mt-1`} />
          </label>
        </>
      );
    case "faq":
      return (
        <>
          {heading}
          <div className="mt-2 space-y-2">
            {s.items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2">
                <div className="flex gap-2">
                  <input value={it.q} maxLength={200} placeholder={t("Question")} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={input} />
                  <button onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={t("Remove")}>
                    <XIcon size={13} />
                  </button>
                </div>
                <textarea value={it.a} rows={2} maxLength={1200} placeholder={t("Answer")} onChange={(e) => onChange({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} className={`${input} mt-1.5`} />
              </div>
            ))}
            <button onClick={() => onChange({ ...s, items: [...s.items, { q: "", a: "" }] })} className="text-xs font-medium text-forge-700 hover:underline">
              + {t("Add a question")}
            </button>
          </div>
        </>
      );
    case "prices":
      return (
        <>
          {heading}
          <p className="mt-2 text-xs text-slate-500">{t("Shows your price list. Edit the items in Plugins → Price list.")}</p>
        </>
      );
    case "contact":
      return (
        <>
          {heading}
          <p className="mt-2 text-xs text-slate-500">{t("Shows your WhatsApp, phone and hours. Edit them in Plugins → WhatsApp & contact.")}</p>
        </>
      );
    case "posts":
      return (
        <>
          {heading}
          <label className="mt-2 block text-xs font-medium text-slate-600">
            {t("How many posts to show")}
            <input type="number" min={1} max={20} value={s.count} onChange={(e) => onChange({ ...s, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className={`${input} mt-1 w-24`} />
          </label>
          <p className="mt-2 text-xs text-slate-500">{t("Shows your latest published posts. Write them in Posts.")}</p>
        </>
      );
  }
}
