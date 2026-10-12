import { useState, type ReactNode } from "react";
import type { Blocks, PriceItem } from "../../api";
import { useT } from "../../i18n";
import { XIcon } from "../../ui/icons";
import { Card } from "../../ui";

/** Editors for the plugins' settings (Plugins page). */

export const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-forge-400 focus:outline-none focus:ring-2 focus:ring-forge-400/30";

export function BlockCard({ icon, title, blurb, on, onToggle, children }: { icon: ReactNode; title: string; blurb: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <Card className={`p-5 transition-colors ${on ? "" : "bg-slate-50/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-forge-500 text-white" : "bg-slate-100 text-slate-400"}`}>{icon}</span>
          <div>
            <h2 className={`font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>{title}</h2>
            <p className="text-xs text-slate-500">{blurb}</p>
          </div>
        </div>
        <Switch on={on} onChange={onToggle} label={title} />
      </div>
      {on && <div className="mt-4">{children}</div>}
    </Card>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-forge-500" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export function InfoBlock({ text, docs, onChange }: { text: string; docs: string; onChange: (text: string) => void }) {
  const t = useT();
  const missing = (text.match(/…|\.\.\.|_{3,}/g) ?? []).length;
  return (
    <div>
      <textarea value={text} rows={8} maxLength={15000} onChange={(e) => onChange(e.target.value)} className={`${input} font-mono text-[13px]`} />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={missing ? "text-amber-700" : "text-slate-400"}>
          {missing ? t("{n} places marked … still need your facts.", { n: missing }) : t("It answers only from what's written here — nothing is made up.")}
        </span>
        {docs && !text.includes(docs.slice(0, 80)) && (
          <button onClick={() => onChange(`${text.trim()}\n\n${docs}`.trim())} className="font-medium text-forge-700 hover:underline">
            + {t("Add the text of my documents")}
          </button>
        )}
      </div>
    </div>
  );
}

export function PriceTable({ items, onChange }: { items: PriceItem[]; onChange: (items: PriceItem[]) => void }) {
  const t = useT();
  const set = (i: number, patch: Partial<PriceItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const unpriced = items.filter((i) => i.price == null).length;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="pb-1 pr-2 font-semibold">{t("Item")}</th>
              <th className="pb-1 pr-2 font-semibold">{t("Unit")}</th>
              <th className="pb-1 pr-2 font-semibold">{t("Price (₦)")}</th>
              <th className="pb-1 pr-2 font-semibold">{t("Note")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <input value={it.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} className={input} />
                </td>
                <td className="py-1 pr-2">
                  <input value={it.unit} maxLength={40} onChange={(e) => set(i, { unit: e.target.value })} className={`${input} min-w-[6rem]`} placeholder={t("e.g. bag (50 kg)")} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    inputMode="decimal"
                    value={it.price ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      set(i, { price: v === "" ? null : Number(v) });
                    }}
                    className={`${input} w-28 ${it.price == null ? "border-amber-300 bg-amber-50/60" : ""}`}
                    placeholder={t("not set")}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input value={it.note ?? ""} maxLength={120} onChange={(e) => set(i, { note: e.target.value })} className={input} />
                </td>
                <td className="py-1">
                  <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={t("Remove")}>
                    <XIcon size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button onClick={() => onChange([...items, { name: "", unit: "", price: null }])} className="font-medium text-forge-700 hover:underline">
          + {t("Add an item")}
        </button>
        {unpriced > 0 && <span className="text-amber-700">{t("{n} without a price: it will say it needs to check with you.", { n: unpriced })}</span>}
      </div>
    </div>
  );
}

export function OrdersBlock({ orders, onChange }: { orders: Blocks["orders"]; onChange: (o: Blocks["orders"]) => void }) {
  const t = useT();
  const [fieldsText, setFieldsText] = useState(orders.fields.join(", "));
  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-slate-600">
        {t("What visitors leave")}
        <select value={orders.kind} onChange={(e) => onChange({ ...orders, kind: e.target.value as Blocks["orders"]["kind"] })} className={`${input} mt-1`}>
          <option value="order">{t("Orders")}</option>
          <option value="booking">{t("Bookings")}</option>
          <option value="enquiry">{t("Enquiries")}</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {t("Details to collect (separated by commas)")}
        <input
          value={fieldsText}
          onChange={(e) => {
            setFieldsText(e.target.value);
            onChange({ ...orders, fields: e.target.value.split(",").map((f) => f.trim()).filter(Boolean).slice(0, 8) });
          }}
          className={`${input} mt-1`}
        />
      </label>
      <p className="text-xs text-slate-400">{t("Confirmed ones arrive in your Inbox. It never takes payment.")}</p>
    </div>
  );
}

export function ContactBlock({ contact, onChange }: { contact: Blocks["contact"]; onChange: (c: Blocks["contact"]) => void }) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-xs font-medium text-slate-600">
        {t("WhatsApp number")}
        <input value={contact.whatsapp} maxLength={30} onChange={(e) => onChange({ ...contact, whatsapp: e.target.value })} className={`${input} mt-1`} placeholder="+234…" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {t("Phone number")}
        <input value={contact.phone} maxLength={30} onChange={(e) => onChange({ ...contact, phone: e.target.value })} className={`${input} mt-1`} placeholder="0803…" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {t("When to reach you")}
        <input value={contact.hours} maxLength={80} onChange={(e) => onChange({ ...contact, hours: e.target.value })} className={`${input} mt-1`} placeholder={t("e.g. 8am–6pm, Mon–Sat")} />
      </label>
    </div>
  );
}

