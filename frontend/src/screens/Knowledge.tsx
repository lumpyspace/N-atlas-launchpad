import { useRef, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";
import { KNOWLEDGE_LIMIT_BYTES, makeDoc, search, storageBytes, tokenize, type KDoc, type KHit } from "../utils/knowledge";
import { timeAgo } from "../utils/projectStatus";
import { ACCEPTED, readFileAsText } from "../utils/readFile";

/**
 * Knowledge: the documents your app answers from. They're split into
 * passages; for every question, the most relevant passages are found and
 * added to the prompt automatically.
 */
export default function Knowledge() {
  const { state, dispatch } = useProject();
  const docs = state.knowledge;
  const needs = state.blueprint?.buildPlan?.dataSources ?? [];
  const used = storageBytes(docs);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [query, setQuery] = useState("");

  function add(name: string, text: string): string | null {
    const doc = makeDoc(name, text);
    if (!doc.chunks.length) return `${name}: no text to add.`;
    if (used + storageBytes([doc]) > KNOWLEDGE_LIMIT_BYTES) {
      return `${name}: too large for in-browser storage (limit ~${Math.round(KNOWLEDGE_LIMIT_BYTES / 1_000_000)} MB per project). Split it or keep only the sections your app needs.`;
    }
    dispatch({ type: "addKnowledge", doc });
    return null;
  }

  async function addFiles(files: FileList | File[]) {
    setBusy(true);
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const err = add(f.name, await readFileAsText(f));
        if (err) errs.push(err);
      } catch (e) {
        errs.push(e instanceof Error ? e.message : String(e));
      }
    }
    setErrors(errs);
    setBusy(false);
  }

  const hits = query.trim() ? search(docs, query, 3) : [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Knowledge</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The documents your app answers from — notes, price lists, policies, laws, FAQs. N-ATLAS doesn't know them,
            so for every question the most relevant passages are found and added to the prompt automatically.
          </p>
        </div>
        <Button onClick={() => dispatch({ type: "setStep", step: "playground" })} disabled={!docs.length}>
          Test with your knowledge →
        </Button>
      </div>

      {needs.length > 0 && (
        <Card className="mt-5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">What this app needs</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {needs.map((n) => (
              <span key={n.name} title={n.why} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                {n.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">From your build guide. Hover for why each one matters.</p>
        </Card>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-forge-500 bg-forge-50" : "border-slate-300 bg-white"
          }`}
        >
          <div className="text-3xl">📄</div>
          <p className="mt-2 text-sm font-medium text-slate-700">Drop files here</p>
          <p className="text-xs text-slate-400">PDF, TXT, Markdown, CSV or JSON</p>
          <Button size="sm" className="mt-3" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Reading…
              </>
            ) : (
              "Choose files"
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Paste */}
        <Card className="flex flex-col p-4">
          <div className="text-sm font-semibold text-slate-800">Or paste text</div>
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title, e.g. “Mile 12 prices — Tuesday”"
            className="mt-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-forge-500 focus:outline-none"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the text your app should know…"
            className="mt-2 h-24 flex-1 resize-y rounded-md border border-slate-300 p-2 text-sm focus:border-forge-500 focus:outline-none"
          />
          <Button
            size="sm"
            className="mt-2 self-end"
            disabled={!pasteText.trim()}
            onClick={() => {
              const err = add(pasteTitle.trim() || `Pasted text ${docs.length + 1}`, pasteText);
              setErrors(err ? [err] : []);
              if (!err) {
                setPasteText("");
                setPasteTitle("");
              }
            }}
          >
            Add to knowledge
          </Button>
        </Card>
      </div>

      {errors.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {/* Documents */}
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">
            Documents
            {docs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                {docs.length} · {docs.reduce((s, d) => s + d.chunks.length, 0)} passages
              </span>
            )}
          </h2>
          <StorageMeter used={used} />
        </div>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No documents yet. Add what your app should answer from.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {docs.map((d) => (
              <DocRow key={d.id} d={d} onRemove={() => dispatch({ type: "removeKnowledge", id: d.id })} />
            ))}
          </ul>
        )}
      </Card>

      {/* Try a search */}
      {docs.length > 0 && (
        <Card className="mt-4 p-4">
          <h2 className="font-semibold text-slate-800">Try a search</h2>
          <p className="text-xs text-slate-500">Type a question a user might ask — these are the passages N-ATLAS would be given.</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What did my notes say about competitive inhibition?"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-forge-500 focus:outline-none"
          />
          {query.trim() && (
            <div className="mt-3 space-y-2">
              {hits.length === 0 ? (
                <p className="text-sm text-amber-700">
                  No matching passages — N-ATLAS would get no facts for this question. Add documents that cover it, or
                  check the wording.
                </p>
              ) : (
                hits.map((h, i) => <HitCard key={h.chunk.id} h={h} rank={i + 1} query={query} />)
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Keyword search (BM25), accent-insensitive. Up to 3 passages are added per question.
          </p>
        </Card>
      )}
    </div>
  );
}

function StorageMeter({ used }: { used: number }) {
  const share = used / KNOWLEDGE_LIMIT_BYTES;
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400" title="Stored in this browser with your project">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${share > 0.85 ? "bg-red-500" : "bg-forge-500"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      {(used / 1_000_000).toFixed(2)} of {(KNOWLEDGE_LIMIT_BYTES / 1_000_000).toFixed(1)} MB
    </div>
  );
}

function DocRow({ d, onRemove }: { d: KDoc; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => setOpen((o) => !o)} className="font-medium text-slate-700 hover:text-forge-700">
          {open ? "▾" : "▸"} {d.name}
        </button>
        <Badge>{d.chunks.length} passage{d.chunks.length === 1 ? "" : "s"}</Badge>
        <span className="text-xs text-slate-400">
          {d.chars.toLocaleString("en-US")} characters · added {timeAgo(d.addedAt)}
        </span>
        <button
          onClick={() => (confirm ? onRemove() : setConfirm(true))}
          className={`ml-auto text-xs ${confirm ? "font-medium text-red-600" : "text-slate-400 hover:text-red-600"}`}
        >
          {confirm ? "Click again to remove" : "Remove"}
        </button>
      </div>
      {open && (
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
          {d.chunks.map((c, i) => (
            <div key={c.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Passage {i + 1}</div>
              <div className="whitespace-pre-wrap">{c.text}</div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/** Highlight the words from the query that matched. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const terms = new Set(tokenize(query));
  return (
    <>
      {text.split(/(\s+)/).map((w, i) => {
        const hit = tokenize(w).some((t) => terms.has(t));
        return hit ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-800">
            {w}
          </mark>
        ) : (
          <span key={i}>{w}</span>
        );
      })}
    </>
  );
}

function HitCard({ h, rank, query }: { h: KHit; rank: number; query: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
        <Badge tone="green">#{rank}</Badge>
        {h.doc.name} — passage {h.index}
        <span className="ml-auto">score {h.score.toFixed(2)}</span>
      </div>
      <div className="line-clamp-6 whitespace-pre-wrap text-sm text-slate-700">
        <Highlighted text={h.chunk.text} query={query} />
      </div>
    </div>
  );
}
