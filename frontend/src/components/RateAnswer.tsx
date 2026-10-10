import { useState } from "react";
import { useT } from "../i18n";
import { BAD_REASONS, type BadReason } from "../utils/testCases";

export interface Rating {
  verdict: "good" | "bad";
  reason?: BadReason;
  note?: string;
}

/**
 * One-tap rating under a reply. 👍 saves it as a test case straight away;
 * 👎 asks what was wrong with one tap (each reason becomes an automatic check).
 */
export function RateAnswer({ saved, onRate }: { saved?: Rating; onRate: (r: Rating) => void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [other, setOther] = useState<string | null>(null);

  if (saved) {
    const reason = BAD_REASONS.find((r) => r.id === saved.reason)?.label;
    return (
      <div className="text-[11px] text-forge-600">
        ✓ {t("Saved as a test case")}
        {saved.verdict === "good" ? " " + t("(good answer)") : reason ? ` — ${t(reason)}` : ""}
      </div>
    );
  }

  if (other !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onRate({ verdict: "bad", reason: "other", note: other })}
          placeholder={t("What was wrong?")}
          className="min-w-48 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-forge-500 focus:outline-none"
        />
        <button
          onClick={() => onRate({ verdict: "bad", reason: "other", note: other })}
          className="rounded-md bg-forge-500 px-2 py-1 text-xs font-medium text-white hover:bg-forge-600"
        >
          {t("Save")}
        </button>
        <button onClick={() => setOther(null)} className="text-xs text-slate-400 hover:text-slate-600">
          {t("Cancel")}
        </button>
      </div>
    );
  }

  if (asking) {
    return (
      <div>
        <div className="mb-1 text-[11px] text-slate-500">{t("What was wrong?")}</div>
        <div className="flex flex-wrap gap-1.5">
          {BAD_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => (r.id === "other" ? setOther("") : onRate({ verdict: "bad", reason: r.id }))}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              {t(r.label)}
            </button>
          ))}
          <button onClick={() => setAsking(false)} className="px-1 text-[11px] text-slate-400 hover:text-slate-600">
            {t("Cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
      {t("Good answer?")}
      <button
        onClick={() => onRate({ verdict: "good" })}
        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-forge-300 hover:bg-forge-50 hover:text-forge-700"
      >
        👍 {t("Yes")}
      </button>
      <button
        onClick={() => setAsking(true)}
        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        👎 {t("Not right")}
      </button>
    </div>
  );
}
