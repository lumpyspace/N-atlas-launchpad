import { useState } from "react";
import { getBlueprint } from "../api";
import { useProject } from "../state/ProjectContext";
import { Button, Card, Spinner } from "../ui";
import { N_, useT } from "../i18n";

const EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: N_("Education"),
    prompt:
      "I want to build an AI assistant that helps Nigerian university students understand admission requirements.",
  },
  {
    label: N_("Agriculture"),
    prompt:
      "An assistant that advises Nigerian farmers on crops, planting seasons and pests.",
  },
  {
    label: N_("Finance"),
    prompt:
      "A personal finance helper that answers Nigerian banking and savings questions in naira.",
  },
  {
    label: N_("Legal"),
    prompt:
      "An assistant that explains Nigerian tenancy rights and common legal processes in plain language.",
  },
  {
    label: N_("Customer Support"),
    prompt:
      "A customer support assistant that helps users with orders, delivery and refunds.",
  },
  {
    label: N_("Custom"),
    prompt: "",
  },
];

/** Step 1: describe the idea in a sentence or two (or start from an example). */
export default function Describe() {
  const { state, dispatch } = useProject();
  const t = useT();
  const [text, setText] = useState(state.description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tooShort = wordCount > 0 && wordCount < 8;

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      dispatch({ type: "setDescription", description: text.trim() });
      const blueprint = await getBlueprint(text.trim());
      dispatch({ type: "setBlueprint", blueprint });
      dispatch({ type: "setStep", step: "blueprint" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-ink">{t("What do you want to build?")}</h1>
      <p className="mt-2 text-slate-500">
        {t("Describe your idea in a sentence or two, in any language you like. We'll turn it into a plan — and then a website with an N-ATLAS assistant on it.")}
      </p>

      <Card className="mt-6 p-5">
        <textarea
          className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm focus:border-forge-500 focus:outline-none focus:ring-2 focus:ring-forge-500/20"
          rows={4}
          placeholder={t(
            "e.g. A WhatsApp assistant that tells farmers in Kaduna when to plant maize and how to deal with pests, in Hausa and English — say who it is for, what it does, the languages and the channel",
          )}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        {tooShort && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span className="font-semibold">{t("Add a bit more detail")}</span> —{" "}
            {t("who is it for, what should it do, and any specific features or languages?")}
            <br />
            <span className="text-amber-500">
              {t("e.g. “A note-taking app for first-year university students that summarises lectures and makes flashcards, in English and Pidgin”")}
            </span>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("Or start from an example")}
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setText(ex.prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-forge-400 hover:text-forge-700"
              >
                {t(ex.label)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-slate-400">{t("⌘/Ctrl + Enter to continue")}</span>
          <Button onClick={submit} disabled={loading || !text.trim()}>
            {loading ? (
              <>
                <Spinner /> {t("Generating blueprint…")}
              </>
            ) : (
              t("Generate blueprint →")
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
