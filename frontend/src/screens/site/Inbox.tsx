import { useEffect, useState } from "react";
import { siteInbox, type InboxItem } from "../../api";
import { LANGUAGES, useT } from "../../i18n";
import { Card } from "../../ui";
import { SiteFrame } from "../../components/site/SiteFrame";
import { useSite } from "../../components/site/useSite";
import { useProject } from "../../state/ProjectContext";
import { timeAgo } from "../../utils/projectStatus";

/** Inbox — what visitors left with the assistant: orders, bookings, enquiries. */
export default function SiteInbox() {
  const t = useT();
  const s = useSite();
  const { dispatch } = useProject();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const slug = s.site?.slug;
  const key = s.site?.ownerKey;

  const load = () => {
    if (!slug || !key) return;
    setLoading(true);
    siteInbox(slug, key)
      .then((r) => (setItems(r.items), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [slug, key]);

  const kind = s.config?.blocks.orders.kind;
  const title = kind === "booking" ? t("Bookings") : kind === "enquiry" ? t("Enquiries") : t("Orders");

  return (
    <SiteFrame
      title={t("Inbox")}
      subtitle={t("{what} visitors confirmed with the assistant. Reply to them on WhatsApp or by phone.", { what: title })}
      actions={
        slug && (
          <button onClick={load} disabled={loading} className="text-sm font-medium text-forge-700 hover:underline">
            {loading ? t("Checking…") : t("Refresh")}
          </button>
        )
      }
    >
      {s.config && !s.config.blocks.orders.on ? (
        <Card className="p-6 text-sm text-slate-600">
          {t("Switch on the “Orders & bookings” plugin to take orders through the assistant.")}{" "}
          <button onClick={() => dispatch({ type: "setStep", step: "plugins" })} className="font-semibold text-forge-700 hover:underline">
            {t("Go to Plugins")}
          </button>
        </Card>
      ) : !slug ? (
        <Card className="p-6 text-sm text-slate-600">{t("Your inbox fills up once your site is published. Until then, try an order in the preview: it shows what would arrive here.")}</Card>
      ) : (
        <>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {items && items.length === 0 && <Card className="p-6 text-sm text-slate-500">{t("Nothing yet. When a visitor confirms, it appears here.")}</Card>}
          <div className="space-y-2">
            {items?.map((it) => (
              <Card key={it.id} className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{timeAgo(it.at, t)}</span>
                  <span>{LANGUAGES.find((l) => l.code === it.language)?.native ?? it.language}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {Object.entries(it.fields).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="capitalize text-slate-500">{k}</dt>
                      <dd className="font-medium text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        </>
      )}
    </SiteFrame>
  );
}
