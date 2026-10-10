import { useEffect, useRef, useState } from "react";
import { streamGenerate, type Check, type JsonType, type TaskTemplate } from "../api";
import type { SavedTestCase } from "../state/ProjectContext";
import { Badge, Button, Card, Spinner } from "../ui";
import { detectLang } from "../utils/langDetect";
import { BAD_REASONS, checksForRating, renderTemplate, withContext } from "../utils/testCases";
import { RateAnswer, type Rating } from "./RateAnswer";
import { SourcesList, type Source } from "./SourcesList";
import { formatHits, search, type KDoc } from "../utils/knowledge";

/** Mirror of backend extractJson/shapeErrors (eval/checks.ts). */
function checkJson(text: string, schema: Record<string, JsonType>): { value?: unknown; errors: string[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { errors: ["no JSON object found"] };
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { errors: [`invalid JSON: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in value)) {
      errors.push(`missing "${key}"`);
      continue;
    }
    const v = value[key];
    const actual = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    if (actual !== type) errors.push(`"${key}" should be ${type}, got ${actual}`);
  }
  return { value, errors };
}

interface Result {
  text: string;
  done: boolean;
  totalMs?: number;
  tokensPerSec?: number;
  error?: string;
}

/** Facts and passages used for one run. */
interface Facts {
  context: string;
  sources: Source[];
}

/**
 * Form → result mode: fill the template's fields, run one request with the
 * app's system prompt and "Your data", and check JSON output against its shape.
 */
export function TaskRunner({
  template,
  systemPrompt,
  data,
  knowledge,
  temperature,
  onSave,
}: {
  template: TaskTemplate;
  systemPrompt: string;
  data: string;
  /** The project's documents; relevant passages are added per run. */
  knowledge: KDoc[];
  temperature: number;
  onSave: (tc: SavedTestCase) => void;
}) {
  const initial = () => Object.fromEntries(template.fields.map((f) => [f.name, f.default ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Rating | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A different template resets the form.
  useEffect(() => {
    setValues(initial());
    setResult(null);
    setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const prompt = renderTemplate(template.prompt, values);
  const running = !!result && !result.done;

  async function run() {
    if (running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSaved(null);
    let text = "";
    const hits = knowledge.length ? search(knowledge, prompt, 3) : [];
    const used: Facts = {
      context: [formatHits(hits), data.trim()].filter(Boolean).join("\n\n"),
      sources: hits.map((h) => ({ doc: h.doc.name, index: h.index, text: h.chunk.text })),
    };
    setFacts(used);
    setResult({ text: "", done: false });
    try {
      for await (const e of streamGenerate(
        prompt,
        {
          system: withContext(systemPrompt, used.context) || undefined,
          temperature,
          maxTokens: template.maxTokens ?? 300,
        },
        ctrl.signal,
      )) {
        if (e.type === "delta") {
          text += e.delta;
          setResult({ text, done: false });
        } else if (e.type === "stats") {
          setResult({ text, done: true, totalMs: e.totalMs, tokensPerSec: e.tokensPerSec });
        } else if (e.type === "error") {
          setResult({ text, done: true, error: e.message });
        }
      }
      setResult((r) => (r && !r.done ? { ...r, done: true } : r));
    } catch (e) {
      setResult({ text, done: true, error: e instanceof Error ? e.message : String(e) });
    } finally {
      abortRef.current = null;
    }
  }

  const json = result?.done && template.output === "json" && template.schema ? checkJson(result.text, template.schema) : null;

  function rate(rating: Rating) {
    if (!result) return;
    const detected = detectLang(prompt);
    const language = detected !== "unknown" ? detected : "en";
    const fromRating = checksForRating(language, rating.verdict, rating.reason, result.text.length);
    // JSON tasks are judged on their shape (a language check means little for
    // JSON), plus whatever the reason adds (e.g. a length limit).
    const checks: Check[] =
      template.output === "json" && template.schema
        ? [
            { type: "jsonShape", schema: template.schema },
            ...fromRating.checks.filter((c) => c.type !== "language"),
          ]
        : fromRating.checks;
    const reasonLabel = BAD_REASONS.find((r) => r.id === rating.reason)?.label ?? "";
    onSave({
      id: crypto.randomUUID(),
      userMessage: prompt,
      assistantReply: result.text,
      language,
      verdict: rating.verdict,
      note: [template.label, reasonLabel, rating.note].filter(Boolean).join(": "),
      expectedBehavior: fromRating.expected,
      savedAt: new Date().toISOString(),
      checks,
      // Exactly the facts this run was given, so re-runs replay them.
      context: (facts?.context ?? data).trim() || undefined,
    });
    setSaved(rating);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <p className="text-xs text-slate-500">{template.hint}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {template.fields.map((f) => (
          <label key={f.name} className={`flex flex-col gap-1 text-xs text-slate-600 ${f.multiline ? "sm:col-span-2" : ""}`}>
            {f.label}
            {f.multiline ? (
              <textarea
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className="h-24 resize-y rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 focus:border-forge-500 focus:outline-none"
              />
            ) : (
              <input
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-forge-500 focus:outline-none"
              />
            )}
          </label>
        ))}
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Prompt sent to N-ATLAS</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{prompt}</pre>
        {data.trim() && <p className="mt-1">+ your data is added to the system prompt.</p>}
      </details>

      <div className="flex items-center gap-2">
        {running ? (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            ■ Stop
          </Button>
        ) : (
          <Button onClick={run}>▶ Run</Button>
        )}
        {template.output === "json" && <Badge tone="blue">Expects JSON: {Object.keys(template.schema ?? {}).join(", ")}</Badge>}
      </div>

      {result && (
        <Card className="p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            {running && <Spinner className="h-3 w-3 text-forge-500" />}
            {running ? "N-ATLAS is writing…" : "Result"}
            {result.totalMs !== undefined && (
              <span className="ml-auto">
                {(result.totalMs / 1000).toFixed(1)}s{result.tokensPerSec ? ` · ${result.tokensPerSec.toFixed(1)} tok/s` : ""}
              </span>
            )}
          </div>
          <div className="whitespace-pre-wrap text-sm text-slate-800">{result.text || (running ? "" : "(empty)")}</div>
          {result.error && <div className="mt-2 text-sm text-red-600">{result.error}</div>}
          {result.done && (
            <div className="mt-2">
              <SourcesList sources={facts?.sources} hasKnowledge={knowledge.length > 0} />
            </div>
          )}

          {json && (
            <div
              className={`mt-3 rounded-md border p-2 text-xs ${
                json.errors.length ? "border-red-200 bg-red-50 text-red-700" : "border-forge-200 bg-forge-50 text-forge-700"
              }`}
            >
              {json.errors.length ? (
                <>
                  <b>✗ Your game/app can't use this output:</b> {json.errors.join("; ")}
                </>
              ) : (
                <>
                  <b>✓ Valid JSON with the expected fields</b>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-700">
                    {JSON.stringify(json.value, null, 2)}
                  </pre>
                </>
              )}
            </div>
          )}

          {result.done && !result.error && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <RateAnswer saved={saved ?? undefined} onRate={rate} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
