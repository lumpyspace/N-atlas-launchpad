/**
 * Export templates — turn the current project into a REAL, runnable N-ATLAS
 * starter kit (JavaScript or Python). Returns a map of { path: contents } that
 * the caller zips. The N-ATLAS client talks to any OpenAI-compatible endpoint
 * (local Ollama, a hosted GPU, or an HF Inference Endpoint) — config via env.
 */

import type { Blueprint, SecurityRunResult, SuiteRunResult } from "../api";
import type { SavedTestCase } from "../state/ProjectContext";
import { testKitFiles } from "./testkit";
import { JS_CHAT_WITH_KNOWLEDGE, knowledgeFiles, PY_CHAT_WITH_KNOWLEDGE, wireServer } from "./knowledgeKit";
import type { KDoc } from "../utils/knowledge";
import { SDK_JS, SDK_PY } from "./sdkSource";
import { chatPage, ENGLISH_PAGE, JS_ENV, PY_SERVER, type PageText } from "./appKit";
import { readme, type ExportLang } from "./readme";

export interface ProjectInput {
  blueprint: Blueprint;
  systemPrompt: string;
  evalResult: SuiteRunResult | null;
  securityResult: SecurityRunResult | null;
  /** The developer's own test cases (with checks) and 👍/👎 verdicts. */
  savedTestCases: SavedTestCase[];
  /** Documents the app answers from. */
  knowledge?: KDoc[];
  /** The language the app replies in ("en" | "pid" | "yo" | "ha" | "ig"). */
  language?: string;
  /** The chat page's interface text, in that language. */
  page?: PageText;
}

/** Load .env in a Python script: `from natlas import X, load_env` and a load_env() call after the imports. */
function withPyEnv(code: string): string {
  return code
    .replace(/^from natlas import ([^#\n]+?)(\s*#.*)?$/m, "from natlas import $1, load_env$2")
    .replace(/^(from system_prompt import [^\n]+)$/m, "$1\n\nload_env()  # settings from .env");
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "Nigerian-accented English",
  pid: "Nigerian Pidgin",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
};

/**
 * Make the app reply in the project's language: a LANGUAGE setting next to the
 * system prompt, passed to every N-ATLAS call in the server and chat script.
 */
function applyLanguage(files: Record<string, string>, lang: ExportLang, language: string) {
  const name = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.en;
  if (lang === "js") {
    files["src/systemPrompt.js"] +=
      `\n// The language your app replies in (${name}): "en", "pid", "yo", "ha" or "ig".\n` +
      `export const LANGUAGE = ${JSON.stringify(language)};\n\n` +
      `const LANGUAGE_NAMES = ${JSON.stringify(LANGUAGE_NAMES)};\n\n` +
      `/** Adds the language instruction to a system prompt (what the SDK's \`language\` option does). */\n` +
      `export function withLanguage(system) {\n  return system + " Respond in " + LANGUAGE_NAMES[LANGUAGE] + ".";\n}\n`;
    for (const f of ["src/server.js", "src/chat.js"]) {
      const code = files[f];
      if (!code?.includes('import { SYSTEM_PROMPT } from "./systemPrompt.js";')) continue;
      // SDK calls take a language option; servers that call N-ATLAS directly add it to the system message.
      const sdkCall = /\{ system: SYSTEM_PROMPT( |,)/.test(code);
      const direct = code.includes('{ role: "system", content: system }');
      if (!sdkCall && !direct) continue;
      const names = [...(sdkCall ? ["LANGUAGE"] : []), "SYSTEM_PROMPT", ...(direct ? ["withLanguage"] : [])];
      files[f] = code
        .replace('import { SYSTEM_PROMPT } from "./systemPrompt.js";', `import { ${names.join(", ")} } from "./systemPrompt.js";`)
        .replace(/\{ system: SYSTEM_PROMPT( |,)/g, "{ system: SYSTEM_PROMPT, language: LANGUAGE$1")
        .split('{ role: "system", content: system }')
        .join('{ role: "system", content: withLanguage(system) }');
    }
  } else {
    files["system_prompt.py"] +=
      `\n# The language your app replies in (${name}): "en", "pid", "yo", "ha" or "ig".\n` +
      `LANGUAGE = ${JSON.stringify(language)}\n`;
    const code = files["chat.py"];
    if (code?.includes("from system_prompt import SYSTEM_PROMPT")) {
      files["chat.py"] = code
        .replace("from system_prompt import SYSTEM_PROMPT", "from system_prompt import LANGUAGE, SYSTEM_PROMPT")
        .replace(/system=SYSTEM_PROMPT/g, "system=SYSTEM_PROMPT, language=LANGUAGE");
    }
  }
}

export type { ExportLang };

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "natlas-app"
  );
}

function evalTests(run: SuiteRunResult | null) {
  return (run?.cases ?? []).map((c) => ({
    id: c.caseId,
    category: c.category,
    prompt: c.prompt,
  }));
}

function securityTests(run: SecurityRunResult | null) {
  return (run?.results ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    prompt: r.prompt,
    expectedBehavior: r.expectedBehavior,
    mitigation: r.mitigation,
  }));
}

export function buildProject(
  input: ProjectInput,
  lang: ExportLang,
): { files: Record<string, string>; rootDir: string } {
  const name = input.blueprint.name;
  const root = `${slug(name)}-${lang === "js" ? "js" : "python"}`;
  const sp = JSON.stringify(input.systemPrompt); // safe literal for JS and Python
  const evals = JSON.stringify(evalTests(input.evalResult), null, 2);
  const secs = JSON.stringify(securityTests(input.securityResult), null, 2);

  const files: Record<string, string> = {
    ...(lang === "js"
      ? jsFiles(name, input.blueprint, sp, evals, secs, input.savedTestCases.length)
      : pyFiles(name, input.blueprint, sp, evals, secs, input.savedTestCases.length)),
    ...testKitFiles(name, input.systemPrompt, input.savedTestCases, lang),
  };

  // Knowledge: ship the passages and the search, and use them in the app.
  const docs = input.knowledge ?? [];
  if (docs.length) {
    Object.assign(files, knowledgeFiles(docs, lang));
    if (lang === "js") {
      files["src/server.js"] = wireServer(files["src/server.js"]);
      files["src/chat.js"] = JS_CHAT_WITH_KNOWLEDGE;
    } else {
      files["chat.py"] = PY_CHAT_WITH_KNOWLEDGE;
    }
    const passages = docs.reduce((s, d) => s + d.chunks.length, 0);
    files["README.md"] +=
      `\n## Knowledge\n\n` +
      `\`knowledge/passages.json\` holds ${passages} passages from your ${docs.length} document${docs.length === 1 ? "" : "s"} ` +
      `(${docs.map((d) => d.name).join(", ")}). For each question, ` +
      (lang === "js" ? "`src/knowledge.js`" : "`knowledge_search.py`") +
      ` finds the 3 most relevant passages (keyword search, accent-insensitive) and adds them to the prompt with an ` +
      `instruction to answer only from them — the same as in Launchpad. To update, re-export or edit the JSON.\n`;
  }

  // An app you can open: its chat page, a Python server to match the JavaScript one, and .env loading everywhere.
  const channel = input.blueprint.buildPlan?.channel?.id;
  if (channel !== "game") {
    files["public/index.html"] = chatPage(name, input.blueprint.purpose, input.language ?? "en", input.page ?? ENGLISH_PAGE);
    if (lang === "python") files["server.py"] = PY_SERVER;
  }
  for (const f of Object.keys(files)) {
    if (lang === "js" && (f === "src/chat.js" || /^tests\/run-[\w-]+\.js$/.test(f))) files[f] = JS_ENV + files[f];
    if (lang === "python" && (f === "chat.py" || /^tests\/run_\w+\.py$/.test(f))) files[f] = withPyEnv(files[f]);
  }

  applyLanguage(files, lang, input.language ?? "en");

  return { files, rootDir: root };
}

// --- JavaScript -------------------------------------------------------------

/** Used for blueprints saved before build plans carried a channel server. */
const FALLBACK_SERVER = `import express from "express";
import { generate } from "./natlas.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message ?? "").slice(0, 2000);
  if (!message.trim()) return res.status(400).json({ error: "message is required" });
  try {
    res.json({ reply: await generate(message, { system: SYSTEM_PROMPT }) });
  } catch {
    res.status(502).json({ error: "N-ATLAS is unavailable, please try again." });
  }
});

app.listen(process.env.PORT ?? 3000);
`;

function jsFiles(
  name: string,
  bp: Blueprint,
  sp: string,
  evals: string,
  secs: string,
  myTests: number,
): Record<string, string> {
  return {
    "package.json": `{
  "name": "${slug(name)}",
  "version": "0.1.0",
  "description": "${name} — an N-ATLAS application generated by N-ATLAS Launchpad.",
  "type": "module",
  "engines": { "node": ">=20.12" },
  "scripts": {
    "start": "node src/server.js",
    "chat": "node src/chat.js",
    "test": "node tests/run-tests.js",
    "test:eval": "node tests/run-eval.js",
    "test:security": "node tests/run-security.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
`,
    "src/server.js": bp.buildPlan?.starter?.code ?? FALLBACK_SERVER,
    ".env.example": `# N-ATLAS is open-weights with no public API — point this at wherever you serve it.
# Local Ollama:   NATLAS_BASE_URL=http://localhost:11434/v1  NATLAS_MODEL=n-atlas
# Hosted GPU/HF:  NATLAS_BASE_URL=https://your-endpoint/v1   NATLAS_API_KEY=...
NATLAS_BASE_URL=http://localhost:11434/v1
NATLAS_API_KEY=
NATLAS_MODEL=n-atlas
`,
    "src/systemPrompt.js": `// Your application's system prompt (generated and hardened in Launchpad).
export const SYSTEM_PROMPT = ${sp};
`,
    // The N-ATLAS SDK (sdk/js in the Launchpad repo): defaults, languages, knowledge, streaming, clear errors.
    "src/natlas.js": SDK_JS,
    "src/chat.js": `import { Natlas } from "./natlas.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const prompt = process.argv.slice(2).join(" ") || "Hello! What can you help me with?";
// Streams the reply as N-ATLAS writes it. Add { language: "yo" | "ha" | "ig" | "pid" } to pick a language.
for await (const delta of new Natlas().stream(prompt, { system: SYSTEM_PROMPT })) process.stdout.write(delta);
process.stdout.write("\\n");
`,
    "tests/eval-tests.json": evals + "\n",
    "tests/security-tests.json": secs + "\n",
    "tests/run-eval.js": `// Replays the evaluation prompts against your configured N-ATLAS endpoint.
import { readFile } from "node:fs/promises";
import { generate } from "../src/natlas.js";
import { SYSTEM_PROMPT } from "../src/systemPrompt.js";

const tests = JSON.parse(await readFile(new URL("./eval-tests.json", import.meta.url), "utf8"));
for (const t of tests) {
  const answer = await generate(t.prompt, { system: SYSTEM_PROMPT });
  console.log("\\n[" + t.id + "] (" + t.category + ")\\nQ: " + t.prompt + "\\nA: " + answer);
}
`,
    "tests/run-security.js": `// Replays the security attacks against your app. Inspect each response:
// it should refuse/ignore the attack and never reveal its system prompt.
import { readFile } from "node:fs/promises";
import { generate } from "../src/natlas.js";
import { SYSTEM_PROMPT } from "../src/systemPrompt.js";

const tests = JSON.parse(await readFile(new URL("./security-tests.json", import.meta.url), "utf8"));
for (const t of tests) {
  const answer = await generate(t.prompt, { system: SYSTEM_PROMPT });
  console.log("\\n[" + t.severity + "] " + t.id + " (" + t.category + ")");
  console.log("Attack:   " + t.prompt);
  console.log("Expected: " + t.expectedBehavior);
  console.log("Response: " + answer);
}
`,
    "README.md": readme(name, bp, "js", myTests),
  };
}

// --- Python -----------------------------------------------------------------

function pyFiles(
  name: string,
  bp: Blueprint,
  sp: string,
  evals: string,
  secs: string,
  myTests: number,
): Record<string, string> {
  return {
    "requirements.txt": "# No dependencies: natlas.py uses only the Python standard library.\n",
    ".env.example": `NATLAS_BASE_URL=http://localhost:11434/v1
NATLAS_API_KEY=
NATLAS_MODEL=n-atlas
`,
    "system_prompt.py": `# Your application's system prompt (generated and hardened in Launchpad).
SYSTEM_PROMPT = ${sp}
`,
    // The N-ATLAS SDK (sdk/python in the Launchpad repo), standard library only.
    "natlas.py": SDK_PY,
    "chat.py": `import sys
from natlas import Natlas
from system_prompt import SYSTEM_PROMPT

prompt = " ".join(sys.argv[1:]) or "Hello! What can you help me with?"
# Streams the reply as N-ATLAS writes it. Add language="yo" | "ha" | "ig" | "pid" to pick a language.
for delta in Natlas().stream(prompt, system=SYSTEM_PROMPT):
    print(delta, end="", flush=True)
print()
`,
    "tests/eval-tests.json": evals + "\n",
    "tests/security-tests.json": secs + "\n",
    "tests/run_eval.py": `import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from natlas import generate  # noqa: E402
from system_prompt import SYSTEM_PROMPT  # noqa: E402

here = os.path.dirname(__file__)
tests = json.load(open(os.path.join(here, "eval-tests.json"), encoding="utf-8"))
for t in tests:
    answer = generate(t["prompt"], system=SYSTEM_PROMPT)
    print(f"\\n[{t['id']}] ({t['category']})\\nQ: {t['prompt']}\\nA: {answer}")
`,
    "tests/run_security.py": `import json, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from natlas import generate  # noqa: E402
from system_prompt import SYSTEM_PROMPT  # noqa: E402

here = os.path.dirname(__file__)
tests = json.load(open(os.path.join(here, "security-tests.json"), encoding="utf-8"))
for t in tests:
    answer = generate(t["prompt"], system=SYSTEM_PROMPT)
    print(f"\\n[{t['severity']}] {t['id']} ({t['category']})")
    print("Attack:   " + t["prompt"])
    print("Expected: " + t["expectedBehavior"])
    print("Response: " + answer)
`,
    "README.md": readme(name, bp, "python", myTests),
  };
}
