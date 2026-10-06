import { useState } from "react";
import { generate, type GenerateResult } from "../api";

/**
 * Playground — a single prompt → N-ATLAS completion. Useful for ad-hoc probing
 * alongside the structured Evaluation dashboard.
 */
const LANGS = [
  { code: "en", label: "Nigerian English" },
  { code: "yo", label: "Yoruba" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
];

export default function Playground() {
  const [prompt, setPrompt] = useState("Explain what N-ATLAS is in two sentences.");
  const [language, setLanguage] = useState("en");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await generate(prompt, { language }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Playground</h2>

      <label className="mb-1 block text-sm font-medium text-slate-600">Prompt</label>
      <textarea
        className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-forge-500 focus:outline-none"
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600">Language</label>
        <select
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <button
          onClick={onSend}
          disabled={loading || prompt.trim().length === 0}
          className="ml-auto rounded-lg bg-forge-500 px-4 py-2 text-sm font-semibold text-white hover:bg-forge-600 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Send to N-ATLAS"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border p-4 ${
            result.isMock ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
          }`}
        >
          {result.isMock && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
              ⚠ Mock output — not real N-ATLAS
            </p>
          )}
          <pre className="whitespace-pre-wrap text-sm text-slate-800">{result.text}</pre>
          <p className="mt-3 text-xs text-slate-400">
            model: {result.model} · provider: {result.provider} · {result.latencyMs}ms
          </p>
        </div>
      )}
    </section>
  );
}
