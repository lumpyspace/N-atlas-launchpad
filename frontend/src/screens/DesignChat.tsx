import { useEffect, useRef, useState } from "react";
import {
  streamDesignTurn,
  type AppBrief,
  type BriefField,
  type DesignMessage,
  type DesignSlot,
  type DesignSnapshot,
} from "../api";
import { ArchitectureDiagram, UseCasePicker } from "../components/BuildGuide";
import { EMPTY_DESIGN, useProject, type DesignState } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";

/** Everything the developer said, as one description (mirrors backend composeDescription). */
function composeDescription(a: DesignState["answers"]): string {
  return [
    a.idea,
    a.users && `It is for ${a.users}`,
    a.problem && `Problem: ${a.problem}`,
    a.features && `It should ${a.features}`,
    a.channel && `Channel: ${a.channel}`,
    a.languages && `Languages: ${a.languages}`,
    a.data && `Data: ${a.data}`,
    a.notes,
  ]
    .filter(Boolean)
    .join(". ");
}

function useElapsed(running: boolean): number {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) {
      setStart(null);
      return;
    }
    setStart(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return start ? Math.round((now - start) / 1000) : 0;
}

/**
 * Design chat: talk the idea through with N-ATLAS while a live canvas shows
 * the app taking shape. The engine keeps the brief (which is also the memory);
 * N-ATLAS writes the replies.
 */
export default function DesignChat({ onQuick }: { onQuick: () => void }) {
  const { state, dispatch } = useProject();
  // Keep the latest design in a ref so streamed updates don't overwrite each other.
  const designRef = useRef<DesignState>(state.design);
  designRef.current = state.design;
  const design = state.design;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const elapsed = useElapsed(busy);

  const update = (patch: Partial<DesignState>) => {
    const next = { ...designRef.current, ...patch };
    designRef.current = next;
    dispatch({ type: "setDesign", design: next });
  };

  async function turn(
    answers: DesignState["answers"],
    messages: DesignMessage[],
    opts: { reply: boolean; useCase?: string } = { reply: true },
  ) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(opts.reply);
    setWarning(null);
    const useCase = opts.useCase ?? designRef.current.useCase;
    update({ answers, messages, useCase, ...(opts.reply ? { messages: [...messages, { role: "assistant", content: "" }] } : {}) });
    try {
      await streamDesignTurn(
        { answers, history: messages, useCase, reply: opts.reply },
        (e) => {
          if (e.type === "snapshot") {
            update({ snapshot: e.snapshot, pendingSlot: e.snapshot.nextSlot });
          } else if (e.type === "delta") {
            const ms = [...designRef.current.messages];
            const last = ms[ms.length - 1];
            if (last?.role === "assistant") ms[ms.length - 1] = { ...last, content: last.content + e.delta };
            update({ messages: ms });
            requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
          } else if (e.type === "warning") {
            setWarning(e.message);
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      setWarning(e instanceof Error ? e.message : String(e));
    } finally {
      // Drop an empty assistant bubble left by a stopped or failed reply.
      const ms = designRef.current.messages;
      if (ms.length && ms[ms.length - 1].role === "assistant" && !ms[ms.length - 1].content.trim()) {
        update({ messages: ms.slice(0, -1) });
      }
      abortRef.current = null;
      setBusy(false);
    }
  }

  // Opening question on first visit.
  useEffect(() => {
    if (started.current || design.messages.length) return;
    started.current = true;
    turn({}, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const slot = designRef.current.pendingSlot;
    const answers = { ...designRef.current.answers };
    if (slot === "done" || slot === "notes") answers.notes = [answers.notes, text].filter(Boolean).join("\n");
    else answers[slot] = text;
    turn(answers, [...designRef.current.messages, { role: "user", content: text }]);
  }

  function editField(slot: DesignSlot, value: string) {
    const answers = { ...designRef.current.answers, [slot]: value };
    if (!value.trim()) delete answers[slot];
    turn(answers, designRef.current.messages, { reply: false });
  }

  function buildIt() {
    const snap = designRef.current.snapshot;
    if (!snap) return;
    dispatch({ type: "setDescription", description: composeDescription(designRef.current.answers) });
    dispatch({ type: "setBlueprint", blueprint: snap.blueprint });
    dispatch({ type: "setStep", step: "blueprint" });
  }

  const snap = design.snapshot;
  const hasIdea = !!design.answers.idea;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Design your app</h1>
          <p className="mt-1 text-sm text-slate-500">
            Talk it through with N-ATLAS. It asks one question at a time and remembers everything — watch your app take
            shape on the right.{" "}
            <button onClick={onQuick} className="font-medium text-forge-600 hover:underline">
              Prefer one sentence? Quick describe →
            </button>
          </p>
        </div>
        {design.messages.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              abortRef.current?.abort();
              started.current = false;
              update(EMPTY_DESIGN);
              setTimeout(() => {
                started.current = true;
                turn({}, []);
              }, 0);
            }}
          >
            Start over
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Conversation */}
        <Card className="flex h-[38rem] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {design.messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-forge-500 text-white"
                      : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-forge-600">N-ATLAS</div>
                  )}
                  {m.content || (busy && i === design.messages.length - 1 ? <Thinking elapsed={elapsed} /> : "")}
                </div>
              </div>
            ))}
            {!design.messages.length && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner /> Starting…
              </div>
            )}
          </div>

          {warning && <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">{warning}</div>}

          <div className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  hasIdea ? "Answer, or tell it anything you want to change…" : "Describe your idea — any language is fine…"
                }
                className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-forge-500 focus:outline-none"
              />
              {busy ? (
                <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                  ■ Stop
                </Button>
              ) : (
                <Button onClick={send} disabled={!input.trim()}>
                  Send
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Enter to send · Shift+Enter for a new line · The canvas updates instantly; N-ATLAS's reply can take a while
              on a laptop.
            </p>
          </div>
        </Card>

        {/* Live canvas */}
        <Canvas
          snap={snap}
          answers={design.answers}
          onEdit={editField}
          onChangeUseCase={async (id) => {
            await turn(designRef.current.answers, designRef.current.messages, { reply: false, useCase: id });
          }}
          onBuild={buildIt}
          canBuild={hasIdea && !busy}
        />
      </div>
    </div>
  );
}

function Thinking({ elapsed }: { elapsed: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-slate-400">
      <Spinner className="h-3 w-3" /> thinking… {elapsed > 5 && `${elapsed}s`}
    </span>
  );
}

// ── Canvas ───────────────────────────────────────────────────────────────────

function Canvas({
  snap,
  answers,
  onEdit,
  onChangeUseCase,
  onBuild,
  canBuild,
}: {
  snap: DesignSnapshot | null;
  answers: DesignState["answers"];
  onEdit: (slot: DesignSlot, value: string) => void;
  onChangeUseCase: (id: string) => Promise<void>;
  onBuild: () => void;
  canBuild: boolean;
}) {
  if (!snap || !answers.idea) {
    return (
      <Card className="flex h-[38rem] flex-col items-center justify-center p-6 text-center text-sm text-slate-400">
        <div className="text-3xl">🧩</div>
        <p className="mt-2">Your app canvas appears here once you describe the idea.</p>
        <p className="mt-1 text-xs">Who it's for, features, languages, the data it needs and how it all connects.</p>
      </Card>
    );
  }
  const b: AppBrief = snap.brief;
  const plan = snap.blueprint.buildPlan!;

  return (
    <Card className="flex h-[38rem] flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your app</div>
        <div className="text-lg font-bold text-ink">{snap.blueprint.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {plan.useCase.label.split(" + ").map((l) => (
            <Badge key={l} tone="green">
              {l}
            </Badge>
          ))}
        </div>
        <UseCasePicker current={plan.useCase.ids[0]} onChange={onChangeUseCase} />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <Field label="Who it's for" slot="users" field={b.users} answer={answers.users} onEdit={onEdit} />
        <Field label="Problem it solves" slot="problem" field={b.problem} answer={answers.problem} onEdit={onEdit} />
        <ListField label="Must-have features" slot="features" field={b.features} answer={answers.features} onEdit={onEdit} />
        <Field label="Where people use it" slot="channel" field={b.channel} answer={answers.channel} onEdit={onEdit} />
        <ListField label="Languages" slot="languages" field={b.languages} answer={answers.languages} onEdit={onEdit} inline />
        <ListField label="Data it needs" slot="data" field={b.data} answer={answers.data} onEdit={onEdit} />
        <Field label="Must never" slot="limits" field={b.limits} answer={answers.limits} onEdit={onEdit} />

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">How it fits together</div>
          <ArchitectureDiagram nodes={plan.architecture} vertical />
        </div>

        {plan.pitfalls.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Plan for</div>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {plan.pitfalls.slice(0, 3).map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
        )}

        {snap.openQuestions.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Still to decide</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {snap.openQuestions.map((q) => (
                <Badge key={q}>{q}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3">
        <Button className="w-full" onClick={onBuild} disabled={!canBuild}>
          Build it → blueprint, build guide &amp; tests
        </Button>
        <p className="mt-1 text-center text-[11px] text-slate-400">
          Suggestions in grey become yours when you confirm or edit them.
        </p>
      </div>
    </Card>
  );
}

function SourceTag({ fromYou }: { fromYou: boolean }) {
  return fromYou ? (
    <span className="text-[10px] font-medium text-forge-600">you said</span>
  ) : (
    <span className="text-[10px] font-medium text-slate-400">suggested</span>
  );
}

function FieldShell({
  label,
  fromYou,
  editing,
  setEditing,
  children,
}: {
  label: string;
  fromYou: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <SourceTag fromYou={fromYou} />
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-[11px] text-slate-400 opacity-0 hover:text-forge-600 group-hover:opacity-100"
          >
            ✎ edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Editor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-1">
      <textarea
        autoFocus
        rows={2}
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 p-1.5 text-sm focus:border-forge-500 focus:outline-none"
      />
      <div className="mt-1 flex gap-2">
        <Button size="sm" onClick={() => onSave(v)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  slot,
  field,
  answer,
  onEdit,
}: {
  label: string;
  slot: DesignSlot;
  field: BriefField<string>;
  answer?: string;
  onEdit: (slot: DesignSlot, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <FieldShell label={label} fromYou={field.fromYou} editing={editing} setEditing={setEditing}>
      {editing ? (
        <Editor
          initial={answer ?? field.value}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            setEditing(false);
            onEdit(slot, v);
          }}
        />
      ) : (
        <p className={`mt-0.5 ${field.fromYou ? "text-slate-800" : "text-slate-400"}`}>{field.value || "—"}</p>
      )}
    </FieldShell>
  );
}

function ListField({
  label,
  slot,
  field,
  answer,
  onEdit,
  inline = false,
}: {
  label: string;
  slot: DesignSlot;
  field: BriefField<string[]>;
  answer?: string;
  onEdit: (slot: DesignSlot, value: string) => void;
  inline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <FieldShell label={label} fromYou={field.fromYou} editing={editing} setEditing={setEditing}>
      {editing ? (
        <Editor
          initial={answer ?? field.value.join(", ")}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            setEditing(false);
            onEdit(slot, v);
          }}
        />
      ) : inline ? (
        <p className={`mt-0.5 ${field.fromYou ? "text-slate-800" : "text-slate-400"}`}>{field.value.join(", ") || "—"}</p>
      ) : (
        <ul className={`mt-0.5 space-y-0.5 ${field.fromYou ? "text-slate-800" : "text-slate-400"}`}>
          {field.value.map((v) => (
            <li key={v}>• {v}</li>
          ))}
        </ul>
      )}
    </FieldShell>
  );
}
