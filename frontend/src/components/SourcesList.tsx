import { useState } from "react";

/** A knowledge passage that was given to N-ATLAS for one reply. */
export interface Source {
  doc: string;
  index: number;
  text: string;
}

/** "📚 Used 2 passages" under a reply — expand to see exactly what N-ATLAS was given. */
export function SourcesList({ sources, hasKnowledge }: { sources?: Source[]; hasKnowledge: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hasKnowledge) return null;
  if (!sources?.length) {
    return (
      <div className="text-[11px] text-amber-700" title="Add documents that cover this question in Knowledge">
        📚 No matching passages in your knowledge — the reply had no facts to go on.
      </div>
    );
  }
  return (
    <div className="text-[11px] text-slate-500">
      <button onClick={() => setOpen((o) => !o)} className="hover:text-slate-700">
        📚 Used {sources.length} passage{sources.length === 1 ? "" : "s"}: {[...new Set(sources.map((s) => s.doc))].join(", ")}{" "}
        {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5">
          {sources.map((s) => (
            <div key={`${s.doc}-${s.index}`} className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {s.doc} — passage {s.index}
              </div>
              <div className="line-clamp-5 whitespace-pre-wrap">{s.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
