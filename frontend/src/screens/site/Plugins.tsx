import { useState, type ReactNode } from "react";
import type { Blocks } from "../../api";
import { useT } from "../../i18n";
import { Badge, Card } from "../../ui";
import { BookIcon, ChatIcon, PackageIcon, SparklesIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { ContactBlock, InfoBlock, input, OrdersBlock, PriceTable } from "../../components/site/editors";
import { docsText, useSite } from "../../components/site/useSite";
import { useProject } from "../../state/ProjectContext";

/** Plugins — WordPress's plugin list: each adds a feature; activate, deactivate, set up. */
export default function SitePlugins() {
  const t = useT();
  const s = useSite();
  const { state } = useProject();
  const c = s.config;
  const setBlocks = (patch: Partial<Blocks>) => s.setConfig((cfg) => ({ ...cfg, blocks: { ...cfg.blocks, ...patch } }));

  return (
    <SiteFrame title={t("Plugins")} subtitle={t("Features you can switch on. Each one is tested and safe: nothing here needs code.")}>
      {c && (
        <div className="space-y-3">
          <Plugin
            icon={<SparklesIcon size={16} />}
            name={t("N-ATLAS assistant")}
            what={t("A chat bubble on every page. It answers from your pages and plugins, in English, Pidgin, Yoruba, Hausa or Igbo. Groq thinks; N-ATLAS speaks the visitor's language.")}
            on={c.blocks.assistant.on}
            onToggle={(on) => setBlocks({ assistant: { on } })}
          >
            <label className="block text-xs font-medium text-slate-600">
              {t("Its first message to visitors")}
              <textarea value={c.greeting} rows={2} maxLength={600} onChange={(e) => s.setConfig((cfg) => ({ ...cfg, greeting: e.target.value }))} className={`${input} mt-1`} />
            </label>
          </Plugin>
          <Plugin
            icon={<span className="text-sm font-bold">₦</span>}
            name={t("Price list")}
            what={t("A price table on your site, and exact prices from the assistant. An item without a price is never guessed.")}
            on={c.blocks.prices.on}
            onToggle={(on) => setBlocks({ prices: { ...c.blocks.prices, on } })}
          >
            <PriceTable items={c.blocks.prices.items} onChange={(items) => setBlocks({ prices: { ...c.blocks.prices, items } })} />
          </Plugin>
          <Plugin
            icon={<PackageIcon size={16} />}
            name={t("Orders & bookings")}
            what={t("The assistant collects the details in conversation, reads them back, and sends confirmed ones to your Inbox. It never takes payment.")}
            on={c.blocks.orders.on}
            onToggle={(on) => setBlocks({ orders: { ...c.blocks.orders, on } })}
          >
            <OrdersBlock orders={c.blocks.orders} onChange={(orders) => setBlocks({ orders })} />
          </Plugin>
          <Plugin
            icon={<ChatIcon size={16} />}
            name={t("WhatsApp & contact")}
            what={t("A WhatsApp button and your phone number on the site; the assistant offers them when someone needs a person.")}
            on={c.blocks.contact.on}
            onToggle={(on) => setBlocks({ contact: { ...c.blocks.contact, on } })}
          >
            <ContactBlock contact={c.blocks.contact} onChange={(contact) => setBlocks({ contact })} />
          </Plugin>
          <Plugin
            icon={<BookIcon size={16} />}
            name={t("Assistant notes")}
            what={t("Extra things only the assistant knows, not shown on the site: policies, details from your documents.")}
            on={c.blocks.info.on}
            onToggle={(on) => setBlocks({ info: { ...c.blocks.info, on } })}
          >
            <InfoBlock text={c.blocks.info.text} docs={docsText(state.knowledge)} onChange={(text) => setBlocks({ info: { ...c.blocks.info, text } })} />
          </Plugin>
        </div>
      )}
    </SiteFrame>
  );
}

function Plugin({ icon, name, what, on, onToggle, children }: { icon: ReactNode; name: string; what: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Card className={`overflow-hidden ${on ? "" : "bg-slate-50/70"}`}>
      <div className="flex items-start gap-3 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-forge-500 text-white" : "bg-slate-200 text-slate-500"}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>{name}</span>
            {on ? <Badge tone="green">{t("Active")}</Badge> : <Badge>{t("Inactive")}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{what}</p>
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <button onClick={() => onToggle(!on)} className={on ? "text-slate-500 hover:text-red-600" : "text-forge-700 hover:underline"}>
              {on ? t("Deactivate") : t("Activate")}
            </button>
            {on && (
              <button onClick={() => setOpen((o) => !o)} className="text-forge-700 hover:underline">
                {open ? t("Close settings") : t("Settings")}
              </button>
            )}
          </div>
        </div>
      </div>
      {on && open && <div className="border-t border-slate-100 bg-white p-4">{children}</div>}
    </Card>
  );
}
