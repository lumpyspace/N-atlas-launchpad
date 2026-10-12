import { useEffect, useRef, useState } from "react";
import { streamHelpAnswer, type DesignMessage, type HelpContext } from "../api";
import { N_, useT } from "../i18n";
import { projectKind, projectName, useWorkspace } from "../state/ProjectContext";
import { Button } from "../ui";
import { ChatIcon, SendIcon, XIcon } from "../ui/icons";
import { nextStep, stages } from "../utils/projectStatus";
import { ChatBubble } from "./ChatBubble";

const STARTERS = [N_("What do I do on this page?"), N_("What should I do next?"), N_("What can I build with Launchpad?"), N_("What is N-ATLAS?")];
const STORE = "natlas-launchpad-helper-v1";

function load(): DesignMessage[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as DesignMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * A small helper beside every page: ask anything along the way. It knows the
 * page you're on and where your project stands. Groq thinks; N-ATLAS puts the
 * answer in your language. The conversation lasts for this browser tab.
 */
export function HelpChat() {
  const { workspace, current, mode, language } = useWorkspace();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DesignMessage[]>(load);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage unavailable: the chat just won't survive a reload */
    }
  }, [messages]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  /** The page in view, in the words the person sees. */
  function context(): HelpContext {
    if (workspace.view === "landing" || (workspace.view === "project" && !current)) return { page: "Landing page", mode };
    if (workspace.view === "home") return { page: "My projects", mode };
    if (workspace.view === "doctor") return { page: "Setup doctor", mode };
    const list = stages(current!, t, mode);
    const page = list.find((s) => s.steps.includes(current!.step))?.label ?? (current!.step === "prompt" ? "Prompt" : current!.step);
    return {
      page,
      mode,
      project: {
        name: projectName(current!),
        kind: projectKind(current!),
        stages: list.map((s) => ({ label: s.label, done: s.done, detail: s.detail })),
        next: nextStep(current!, t, mode)?.text,
      },
    };
  }

  const set = (ms: DesignMessage[]) => {
    messagesRef.current = ms;
    setMessages(ms);
  };
  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  async function ask(question: string) {
    const words = question.trim();
    if (!words || busy) return;
    setDraft("");
    setWarning(null);
    const history: DesignMessage[] = [...messagesRef.current, { role: "user", content: words }];
    set([...history, { role: "assistant", content: "" }]);
    scrollDown();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    const patch = (f: (m: DesignMessage) => DesignMessage, onUser = false) => {
      const ms = [...messagesRef.current];
      const i = ms.length - (onUser ? 2 : 1);
      if (ms[i]) ms[i] = f(ms[i]);
      set(ms);
    };
    try {
      await streamHelpAnswer(
        { history: history.slice(-12), language, context: context() },
        (e) => {
          if (e.type === "delta") patch((m) => ({ ...m, content: m.content + e.delta }));
          else if (e.type === "reset") patch((m) => ({ ...m, content: "" }));
          else if (e.type === "question") patch((m) => ({ ...m, english: e.english }));
          else if (e.type === "via") patch((m) => ({ ...m, brain: e.brain, voice: e.voice }));
          else if (e.type === "understood") patch((m) => ({ ...m, understood: e.english }), true);
          else if (e.type === "warning") setWarning(e.message);
          if (e.type === "delta") scrollDown();
        },
        ctrl.signal,
      );
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      const ms = messagesRef.current;
      if (ms.length && ms[ms.length - 1].role === "assistant" && !ms[ms.length - 1].content.trim()) set(ms.slice(0, -1));
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium tracking-wide text-paper shadow-pop transition-colors hover:bg-stone-800"
        aria-label={t("Ask for help")}
      >
        <ChatIcon size={18} />
        <span className="hidden sm:inline">{t("Ask for help")}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-30 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[24rem]">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-forge-50 to-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink">{t("Launchpad helper")}</div>
          <div className="text-[11px] text-slate-500">{t("Ask anything along the way — in your language.")}</div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && !busy && (
            <button onClick={() => set([])} className="rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              {t("New chat")}
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("Close")}>
            <XIcon size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px]">
        {messages.length === 0 && (
          <div className="py-3 text-center">
            <p className="text-xs text-slate-500">{t("Stuck, or curious? Ask me anything — about this page, your project, or N-ATLAS.")}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(t(s))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-forge-300 hover:text-forge-700"
                >
                  {t(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} m={m} compact thinking={busy && i === messages.length - 1} elapsed={elapsed} />
        ))}
      </div>

      {warning && <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">{t(warning)}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-2 border-t border-slate-100 p-2.5"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Ask a question…")}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-forge-400 focus:outline-none focus:ring-2 focus:ring-forge-400/30"
        />
        {busy ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => abortRef.current?.abort()}>
            {t("Stop")}
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={!draft.trim()} aria-label={t("Send")}>
            <SendIcon size={14} />
          </Button>
        )}
      </form>
    </div>
  );
}
