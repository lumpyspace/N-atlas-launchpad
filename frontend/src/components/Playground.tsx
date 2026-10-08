import { useRef, useState } from "react";
import { generate, type GenerateResult, type HealthStatus } from "../api";
import { useProject } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";

/**
 * Playground — the central interactive screen. Three panes:
 *   LEFT   : application config (system prompt, model).
 *   CENTER : chat with your N-ATLAS app.
 *   RIGHT  : app info + quick actions.
 */
interface Msg {
  role: "user" | "assistant";
  text: string;
  isMock?: boolean;
  error?: boolean;
}

const LANGS = [
  { code: "en", label: "Nigerian English" },
  { code: "yo", label: "Yoruba" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
];

export default function Playground({ health }: { health: HealthStatus | null }) {
  const { state, dispatch } = useProject();
  const bp = state.blueprint;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const live = health?.provider === "http" && health.ok;

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setLoading(true);
    try {
      const res: GenerateResult = await generate(prompt, {
        system: state.systemPrompt || undefined,
        language,
      });
      setMessages((m) => [
        ...m,
        { role: "assistant", text: res.text, isMock: res.isMock },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : String(e),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }),
      );
    }
  }

  const quick = bp
    ? [
        "What are the admission requirements?",
        "Wetin be JAMB?",
        "Explain this in simple terms.",
      ]
    : ["Say hello.", "What can you help me with?"];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {bp?.name ?? "N-ATLAS Playground"}
          </h1>
          <p className="text-sm text-slate-500">
            Chat with your application. Try to break it, or just see how it
            responds.
          </p>
        </div>
        <Button onClick={() => dispatch({ type: "setStep", step: "evaluate" })}>
          Continue to Evaluate →
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr_15rem]">
        {/* LEFT — config */}
        <Card className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            System prompt
          </h3>
          <textarea
            className="h-56 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-700 focus:border-forge-500 focus:outline-none"
            value={state.systemPrompt}
            onChange={(e) =>
              dispatch({ type: "setSystemPrompt", systemPrompt: e.target.value })
            }
            placeholder="Your app's system instructions…"
          />
          <div className="mt-3 text-xs text-slate-400">
            Model:{" "}
            <span className="font-medium text-slate-600">
              {health?.model ?? "N-ATLAS"}
            </span>
          </div>
        </Card>

        {/* CENTER — chat */}
        <Card className="flex h-[32rem] flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-semibold text-slate-700">Chat</span>
            <Badge tone={live ? "green" : "amber"}>
              {live ? "● LIVE N-ATLAS" : "● DEMO MODE"}
            </Badge>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="mt-12 text-center text-sm text-slate-400">
                Send a message to start. Powered by N-ATLAS.
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} msg={m} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Spinner /> N-ATLAS is responding…
                {live && " (live inference can be slow)"}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-forge-500 focus:outline-none"
                placeholder="Ask your app something…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
              />
              <Button onClick={() => send(input)} disabled={loading || !input.trim()}>
                Send
              </Button>
            </div>
          </div>
        </Card>

        {/* RIGHT — info + quick actions */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quick prompts
            </h3>
            <div className="space-y-2">
              {quick.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-forge-400 hover:text-forge-700 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Language hint
            </h3>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            {bp && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {bp.languages.map((l) => (
                  <Badge key={l}>{l}</Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-forge-500 px-3 py-2 text-sm text-white">
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border px-3 py-2 text-sm ${
          msg.error
            ? "border-red-200 bg-red-50 text-red-700"
            : msg.isMock
              ? "border-amber-200 bg-amber-50 text-slate-700"
              : "border-slate-200 bg-slate-50 text-slate-800"
        }`}
      >
        {msg.isMock && !msg.error && (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
            Demo response — not real N-ATLAS
          </div>
        )}
        {msg.text}
      </div>
    </div>
  );
}
