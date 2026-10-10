/**
 * Translate Launchpad's interface with N-ATLAS.
 *
 *   cd backend && npx tsx ../scripts/translate-ui.mts [--lang yo,ha] [--limit 20] [--write]
 *
 * Every UI string (t("…") / N_("…") in the frontend) is sent to N-ATLAS in
 * small batches. Each translation is checked — {placeholders} kept, not empty,
 * not left in English — and progress is cached in scripts/.translate-cache so
 * a long CPU run can stop and resume. With --write, the dictionaries in
 * frontend/src/i18n are rebuilt from N-ATLAS's translations; strings N-ATLAS
 * couldn't translate cleanly keep the existing entry and are listed as
 * fallbacks in the file header for review.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Natlas } from "../sdk/js/natlas.js";
import { extractKeys } from "../tests/i18n.test.ts";

const ROOT = new URL("../", import.meta.url);
const CACHE_DIR = new URL("scripts/.translate-cache/", ROOT);
const LANG_NAMES = { pid: "Nigerian Pidgin", yo: "Yoruba", ha: "Hausa", ig: "Igbo" } as const;
type Lang = keyof typeof LANG_NAMES;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const langs = (arg("lang")?.split(",") ?? Object.keys(LANG_NAMES)) as Lang[];
const limit = Number(arg("limit") ?? Infinity);
const write = process.argv.includes("--write");

const natlas = new Natlas({ timeoutMs: 900_000 });
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** Words that are fine to leave as they are (product names, code terms). */
const KEEP = /^(N-ATLAS|N-ATLaS|Launchpad|Ollama|GitHub|JSON|SDK|CI|API|PDF|TXT|CSV|Markdown|TypeScript|JavaScript|Python|curl|Prompt|Model|Model:|Temperature|Max tokens|Test case|System prompt|Prompt Injection|System-Prompt Extraction|Prompt studio|Hausa|Igbo|Yoruba|Docs ↗|SDK docs ↗|\{\w+\}s|\{m\}m \{s\}s|Q:|EN \(machine\):)$/;

export function check(en: string, out: string | undefined): string | null {
  if (!out || !out.trim()) return "empty";
  if (placeholders(out) !== placeholders(en)) return `placeholders ${placeholders(out) || "none"} ≠ ${placeholders(en) || "none"}`;
  if (out.trim() === en.trim() && !KEEP.test(en) && /[a-z]{3}/i.test(en)) return "left in English";
  if (out.length > en.length * 3 + 40) return "too long — probably added notes";
  return null;
}

function system(lang: Lang): string {
  const name = LANG_NAMES[lang];
  return (
    `You translate the interface of N-ATLAS Launchpad, a tool for software developers in Nigeria, into natural, everyday ${name}. ` +
    "Keep exactly as they are: anything in {curly braces}, product names (N-ATLAS, Launchpad, Ollama, GitHub), code, file names, " +
    "and technical words developers use in English (prompt, system prompt, token, JSON, SDK, API, CI, test case, model, endpoint, backend). " +
    "Keep symbols such as →, ↗, ✓, …, ·, — and emoji. Keep translations about as short as the English." +
    (lang === "yo" ? " Write Yoruba with full tone marks." : "") +
    (lang === "ig" ? " Write Igbo with its dotted vowels (ị, ọ, ụ)." : "") +
    (lang === "ha" ? " Write Hausa with its hooked letters (ɓ, ɗ, ƙ) where they belong." : "")
  );
}

/** One batch → JSON array of translations (null where the model's output didn't parse). */
async function translateBatch(lang: Lang, items: string[]): Promise<(string | undefined)[]> {
  const prompt =
    `Translate each string into ${LANG_NAMES[lang]}. Reply with only a JSON array of ${items.length} strings, in the same order.\n\n` +
    JSON.stringify(items, null, 1);
  const budget = Math.min(2000, Math.ceil(items.join(" ").length / 1.5) + 60);
  const { text } = await natlas.chat(prompt, { system: system(lang), maxTokens: budget, temperature: 0.1 });
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(arr) && arr.length === items.length) return arr.map((s) => (typeof s === "string" ? s.trim() : undefined));
  } catch {
    /* fall through to one-by-one */
  }
  return items.map(() => undefined);
}

async function translateOne(lang: Lang, en: string): Promise<string> {
  const { text } = await natlas.chat(`Translate into ${LANG_NAMES[lang]}. Reply with only the translation.\n\n${en}`, {
    system: system(lang),
    maxTokens: Math.min(1200, Math.ceil(en.length / 1.2) + 40),
    temperature: 0.1,
  });
  return text
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/^(translation|answer)\s*:\s*/i, "")
    .replace(/^["“]+|["”]+$/g, "")
    .trim();
}

type Cache = Record<string, { text?: string; problem?: string }>;
const cachePath = (lang: Lang) => new URL(`${lang}.json`, CACHE_DIR);
const loadCache = (lang: Lang): Cache => (existsSync(cachePath(lang)) ? JSON.parse(readFileSync(cachePath(lang), "utf8")) : {});
const saveCache = (lang: Lang, c: Cache) => writeFileSync(cachePath(lang), JSON.stringify(c, null, 1));

async function run(lang: Lang, keys: string[]) {
  const cache = loadCache(lang);
  const todo = keys.filter((k) => !cache[k]?.text && !cache[k]?.problem).slice(0, limit);
  const finished = keys.filter((k) => cache[k]?.text || cache[k]?.problem).length;
  console.log(`\n${lang}: ${todo.length} to translate (${finished} already done)`);
  // Short strings go in batches of 8; long ones alone.
  const short = todo.filter((k) => k.length <= 120);
  const long = todo.filter((k) => k.length > 120);
  const started = Date.now();
  let done = 0;
  const report = (k: string) => {
    done++;
    const c = cache[k];
    const rate = (Date.now() - started) / done;
    console.log(
      `  [${done}/${todo.length}] ${c.problem ? "✗ " + c.problem : "✓"}  ${k.slice(0, 50)} → ${(c.text ?? "").slice(0, 60)}` +
        `   (~${Math.round((rate * (todo.length - done)) / 60000)} min left)`,
    );
  };
  for (let i = 0; i < short.length; i += 8) {
    const batch = short.slice(i, i + 8);
    const outs = await translateBatch(lang, batch).catch(() => batch.map(() => undefined));
    for (let j = 0; j < batch.length; j++) {
      let out = outs[j];
      if (check(batch[j], out)) out = await translateOne(lang, batch[j]).catch(() => undefined);
      const problem = check(batch[j], out);
      cache[batch[j]] = problem ? { problem, text: undefined } : { text: out };
      report(batch[j]);
    }
    saveCache(lang, cache);
  }
  for (const k of long) {
    const out = await translateOne(lang, k).catch(() => undefined);
    const problem = check(k, out);
    cache[k] = problem ? { problem } : { text: out };
    saveCache(lang, cache);
    report(k);
  }
}

function writeDictionary(lang: Lang, keys: string[]) {
  const cache = loadCache(lang);
  const file = new URL(`frontend/src/i18n/${lang}.ts`, ROOT);
  // The current file is the fallback for anything N-ATLAS couldn't translate cleanly.
  const current: Record<string, string> = {};
  for (const m of readFileSync(file, "utf8").matchAll(/^\s*(".*?(?<!\\)"):\s*\n?\s*(".*?(?<!\\)"),$/gms)) {
    current[JSON.parse(m[1])] = JSON.parse(m[2]);
  }
  const fallbacks = keys.filter((k) => !cache[k]?.text);
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(cache[k]?.text ?? current[k] ?? k)},`);
  const header = [
    `// Launchpad interface text in ${LANG_NAMES[lang]}, keyed by the English text.`,
    `// Translated by N-ATLAS (scripts/translate-ui.mts, ${new Date().toISOString().slice(0, 10)}).`,
    `// ${keys.length - fallbacks.length} of ${keys.length} strings are N-ATLAS's; ${fallbacks.length} kept the previous`,
    `// (AI-written) text because N-ATLAS's output failed a check — listed below. A native speaker should review all of it.`,
    ...fallbacks.map((k) => `//   fallback: ${JSON.stringify(k).slice(0, 110)} (${cache[k]?.problem ?? "not translated yet"})`),
  ];
  writeFileSync(file, [...header, "const dict: Record<string, string> = {", ...lines, "};", "", "export default dict;", ""].join("\n"));
  console.log(`wrote ${lang}.ts — ${keys.length - fallbacks.length} from N-ATLAS, ${fallbacks.length} fallbacks`);
}

mkdirSync(CACHE_DIR, { recursive: true });
const keys = [...extractKeys()].sort();
for (const lang of langs) {
  if (!write) await run(lang, keys);
  else writeDictionary(lang, keys);
}
