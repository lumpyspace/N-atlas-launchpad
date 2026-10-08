import { useState } from "react";
import { getBlueprint } from "../api";
import { useProject } from "../state/ProjectContext";
import { Button, Card, Spinner } from "../ui";

const EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: "Education",
    prompt:
      "I want to build an AI assistant that helps Nigerian university students understand admission requirements.",
  },
  {
    label: "Agriculture",
    prompt:
      "An assistant that advises Nigerian farmers on crops, planting seasons and pests.",
  },
  {
    label: "Finance",
    prompt:
      "A personal finance helper that answers Nigerian banking and savings questions in naira.",
  },
  {
    label: "Legal",
    prompt:
      "An assistant that explains Nigerian tenancy rights and common legal processes in plain language.",
  },
  {
    label: "Customer Support",
    prompt:
      "A customer support assistant that helps users with orders, delivery and refunds.",
  },
  {
    label: "Custom",
    prompt: "",
  },
];

export default function Describe() {
  const { state, dispatch } = useProject();
  const [text, setText] = useState(state.description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <h1 className="text-2xl font-bold text-ink">What do you want to build?</h1>
      <p className="mt-2 text-slate-500">
        Describe your idea in a sentence. We'll turn it into an N-ATLAS
        application blueprint — name, system prompt, and the tests to run.
      </p>

      <Card className="mt-6 p-5">
        <textarea
          className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm focus:border-forge-500 focus:outline-none focus:ring-2 focus:ring-forge-500/20"
          rows={4}
          placeholder="I want to build an AI assistant that helps Nigerian university students understand admission requirements."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Or start from an example
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setText(ex.prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-forge-400 hover:text-forge-700"
              >
                {ex.label}
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
          <span className="text-xs text-slate-400">⌘/Ctrl + Enter to continue</span>
          <Button onClick={submit} disabled={loading || !text.trim()}>
            {loading ? (
              <>
                <Spinner /> Generating blueprint…
              </>
            ) : (
              "Generate blueprint →"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
