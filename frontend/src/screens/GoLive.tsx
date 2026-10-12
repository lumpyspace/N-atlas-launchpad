import { useEffect, useRef, useState } from "react";
import { checkLiveLink, streamDeployAnswer, type DesignMessage, type GuideProject, type LiveCheck } from "../api";
import { ChatBubble } from "../components/ChatBubble";
import { N_, useT } from "../i18n";
import { projectName, useProject } from "../state/ProjectContext";
import { Button, Card, Spinner } from "../ui";
import { CheckIcon, ExternalIcon, GlobeIcon, RocketIcon, SendIcon, XIcon } from "../ui/icons";
import { hostOf, isLive } from "../utils/projectStatus";

/** Questions to start from, in the developer's language (they're sent as their own words). */
const STARTERS = [
  N_("How do I put my app online?"),
  N_("Deploy it on Vercel"),
  N_("Deploy it on Modal"),
  N_("Run it on my own server with Docker"),
];

/**
 * Go live: the developer asks how to put their app online — in their own
 * language — and gets steps written for their exported project. Launchpad
 * never deploys anything itself. Then they check the live link here.
 */
export default function GoLive() {
  const { state, dispatch } = useProject();
  const t = useT();
  const bp = state.blueprint;
  const goLive = state.goLive ?? { messages: [] };
  const goLiveRef = useRef(goLive);
  goLiveRef.current = goLive;
  const [lang, setLang] = useState<"js" | "python">(state.exportLang ?? "js");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  if (!bp) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card className="p-8 text-center text-slate-500">{t("Describe and build your app first, then export it.")}</Card>
      </div>
    );
  }

  const channel = bp.buildPlan?.channel?.id ?? "web";
  const project: GuideProject = { name: projectName(state), lang, channel, knowledge: (state.knowledge?.length ?? 0) > 0 };
  const starters = channel === "whatsapp" ? [...STARTERS, N_("Connect it to WhatsApp")] : channel === "telegram" ? [...STARTERS, N_("Connect it to Telegram")] : STARTERS;

  const save = (patch: Partial<typeof goLive>) => {
    const next = { ...goLiveRef.current, ...patch };
    goLiveRef.current = next;
    dispatch({ type: "setGoLive", goLive: next });
  };
  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  async function ask(question: string) {
    const words = question.trim();
    if (!words || busy) return;
    setDraft("");
    setWarning(null);
    const history: DesignMessage[] = [...goLiveRef.current.messages, { role: "user", content: words }];
    save({ messages: [...history, { role: "assistant", content: "" }] });
    scrollDown();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    const patchLast = (f: (m: DesignMessage) => DesignMessage, onUser = false) => {
      const ms = [...goLiveRef.current.messages];
      const i = ms.length - (onUser ? 2 : 1);
      if (ms[i]) ms[i] = f(ms[i]);
      save({ messages: ms });
    };
    try {
      await streamDeployAnswer(
        { project, history, language: state.language },
        (e) => {
          if (e.type === "delta") patchLast((m) => ({ ...m, content: m.content + e.delta }));
          else if (e.type === "reset") patchLast((m) => ({ ...m, content: "" }));
          else if (e.type === "question") patchLast((m) => ({ ...m, english: e.english }));
          else if (e.type === "via") patchLast((m) => ({ ...m, brain: e.brain, voice: e.voice }));
          else if (e.type === "understood") patchLast((m) => ({ ...m, understood: e.english }), true);
          else if (e.type === "warning") setWarning(e.message);
          if (e.type === "delta") scrollDown();
        },
        ctrl.signal,
      );
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      // Drop an empty answer left by a stopped or failed request.
      const ms = goLiveRef.current.messages;
      if (ms.length && ms[ms.length - 1].role === "assistant" && !ms[ms.length - 1].content.trim()) save({ messages: ms.slice(0, -1) });
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }

  const live = isLive(state);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-forge-50 text-forge-600">
          <RocketIcon size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("Go live")}</h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            {t("Ask how to put {app} online — in your own language. The guide knows your project's files, commands and settings, and walks you through it step by step.", { app: project.name })}
          </p>
        </div>
      </div>

      {live && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-forge-200 bg-forge-50 px-4 py-3 text-sm text-forge-800">
          <CheckIcon size={18} className="text-forge-600" />
          <span className="font-semibold">{t("Your app is live")}</span>
          <a href={goLive.check!.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
            {hostOf(goLive.check!.url)} <ExternalIcon size={12} />
          </a>
        </div>
      )}

      {!state.exportedAt && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("Download your project first: the guide explains that folder.")}{" "}
          <button onClick={() => dispatch({ type: "setStep", step: "export" })} className="font-semibold underline">
            {t("Go to Ship")}
          </button>
        </div>
      )}

      <Card className="mt-6 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Deploy guide")}</span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">{t("Your project:")}</span>
            {(["js", "python"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-md px-2 py-0.5 font-medium ${lang === l ? "bg-forge-50 text-forge-700" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {l === "js" ? "JavaScript" : "Python"}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="max-h-[32rem] min-h-[14rem] space-y-4 overflow-y-auto px-4 py-4">
          {goLive.messages.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-500">{t("Where do you want your app to live? Pick a question or ask your own.")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(t(s))}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 shadow-card transition-colors hover:border-forge-300 hover:text-forge-700"
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {goLive.messages.map((m, i) => (
            <ChatBubble key={i} m={m} thinking={busy && i === goLive.messages.length - 1} elapsed={elapsed} />
          ))}
        </div>

        {warning && <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">{t(warning)}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex items-center gap-2 border-t border-slate-100 p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("Ask anything about putting your app online…")}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-forge-400 focus:outline-none focus:ring-2 focus:ring-forge-400/30"
          />
          {busy ? (
            <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
              {t("Stop")}
            </Button>
          ) : (
            <Button type="submit" disabled={!draft.trim()}>
              <SendIcon size={14} /> {t("Send")}
            </Button>
          )}
        </form>
      </Card>

      <LiveLinkCheck
        check={goLive.check}
        sample={state.savedTestCases[0]?.userMessage}
        onChecked={(check) => save({ check })}
      />
    </div>
  );
}

/** Paste the live link: Launchpad opens it like a first visitor would. */
function LiveLinkCheck({ check, sample, onChecked }: { check?: LiveCheck; sample?: string; onChecked: (c: LiveCheck) => void }) {
  const t = useT();
  const [url, setUrl] = useState(check?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onChecked(await checkLiveLink(url, sample ?? t("Hello! What can you help me with?")));
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = check
    ? [
        { ok: check.page.ok, label: t("The page opens"), detail: check.page.ok ? `${check.page.title ?? ""} · ${check.page.ms} ms` : check.page.problem },
        {
          ok: check.chat.ok,
          label: t("N-ATLAS answers"),
          detail: check.chat.ok ? `“${(check.chat.reply ?? "").slice(0, 160)}” · ${((check.chat.ms ?? 0) / 1000).toFixed(1)} s` : check.chat.problem,
        },
        { ok: check.guards.ok, label: t("Safety checks are on"), detail: check.guards.ok ? t("an over-long message was refused") : check.guards.problem },
      ]
    : [];

  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <GlobeIcon size={16} className="text-forge-600" /> {t("Check my live link")}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{t("Deployed it? Paste the link: Launchpad opens it like your first visitor — the page, a real N-ATLAS answer, and the safety checks.")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) run();
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://my-app.vercel.app"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-forge-400 focus:outline-none focus:ring-2 focus:ring-forge-400/30"
        />
        <Button type="submit" disabled={busy || !url.trim()}>
          {busy ? (
            <>
              <Spinner className="h-3.5 w-3.5" /> {t("Checking… a sleeping app can take a minute")}
            </>
          ) : (
            t("Check it")
          )}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-2.5 text-sm">
              <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${r.ok ? "bg-forge-500 text-white" : "bg-red-100 text-red-600"}`}>
                {r.ok ? <CheckIcon size={12} /> : <XIcon size={12} />}
              </span>
              <span>
                <span className="font-medium text-slate-800">{r.label}</span>
                {r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
