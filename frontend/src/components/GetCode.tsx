import { useEffect, useState } from "react";
import { downloadSdk } from "../utils/sdkDownload";
import { useT } from "../i18n";

/** Same wording the backend appends for a language hint (HttpNAtlasProvider). */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "Nigerian-accented English",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
  pid: "Nigerian Pidgin",
};

export interface CodeRequest {
  endpoint: string;
  model: string;
  system: string;
  language: string;
  temperature: number;
  maxTokens: number;
  message: string;
  /** The project has Knowledge documents (exported as knowledge/passages.json). */
  hasKnowledge?: boolean;
}

type Lang = "sdk-js" | "sdk-py" | "curl" | "js" | "python";

const TABS: Array<[Lang, string]> = [
  ["sdk-js", "SDK · JavaScript"],
  ["sdk-py", "SDK · Python"],
  ["js", "fetch"],
  ["python", "requests"],
  ["curl", "curl"],
];

/** The exact chat-completions body the Playground sends. */
function requestBody(r: CodeRequest) {
  const system = [r.system.trim(), LANGUAGE_NAMES[r.language] ? `Respond in ${LANGUAGE_NAMES[r.language]}.` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    model: r.model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: r.message || "Hello!" },
    ],
    temperature: Number(r.temperature.toFixed(2)),
    max_tokens: r.maxTokens,
  };
}

/** The same call through the N-ATLAS SDK (sdk/ in the Launchpad repo). */
function sdkSnippet(lang: "js" | "python", r: CodeRequest): string {
  const DEFAULT_URL = "http://localhost:11434/v1";
  const lit = (s: string) => JSON.stringify(s); // valid in both JS and Python
  // Multi-line prompts keep their line breaks: a template literal / triple-quoted string.
  const block = (s: string) =>
    !s.includes("\n")
      ? lit(s)
      : lang === "js"
        ? "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`"
        : '"""' + s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"').replace(/"$/, '\\"') + '"""';
  const opts: string[] = [];
  const temp = Number(r.temperature.toFixed(2));
  if (lang === "js") {
    opts.push("system: SYSTEM_PROMPT");
    if (LANGUAGE_NAMES[r.language]) opts.push(`language: ${lit(r.language)}`);
    if (temp !== 0.1) opts.push(`temperature: ${temp}`);
    if (r.maxTokens !== 512) opts.push(`maxTokens: ${r.maxTokens}`);
    if (r.hasKnowledge) opts.push("knowledge");
    const client = [
      r.endpoint !== DEFAULT_URL ? `baseURL: process.env.NATLAS_BASE_URL ?? ${lit(r.endpoint)}` : "",
      r.model !== "n-atlas" ? `model: ${lit(r.model)}` : "",
    ].filter(Boolean);
    return [
      `// natlas.js — the N-ATLAS SDK: one file, no dependencies (download it below).`,
      `// Reads NATLAS_BASE_URL, NATLAS_MODEL and NATLAS_API_KEY; defaults to local Ollama.`,
      r.hasKnowledge ? `import { readFileSync } from "node:fs";\nimport { Natlas, Knowledge } from "./natlas.js";` : `import { Natlas } from "./natlas.js";`,
      ``,
      `const natlas = new Natlas(${client.length ? `{ ${client.join(", ")} }` : ""});`,
      r.hasKnowledge
        ? `// Your documents — knowledge/passages.json comes with Ship → Download.\nconst knowledge = Knowledge.fromJSON(readFileSync("knowledge/passages.json", "utf8"));`
        : null,
      `const SYSTEM_PROMPT = ${block(r.system.trim())};`,
      ``,
      `const reply = await natlas.chat(${lit(r.message || "Hello!")}, {`,
      ...opts.map((o) => `  ${o},`),
      `});`,
      `console.log(reply.text);`,
      r.hasKnowledge ? `console.log("Sources:", reply.sources.map((s) => s.source + " #" + s.index));` : null,
      ``,
      `// Stream instead:  for await (const d of natlas.stream(question, options)) process.stdout.write(d);`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  }
  opts.push("system=SYSTEM_PROMPT");
  if (LANGUAGE_NAMES[r.language]) opts.push(`language=${lit(r.language)}`);
  if (temp !== 0.1) opts.push(`temperature=${temp}`);
  if (r.maxTokens !== 512) opts.push(`max_tokens=${r.maxTokens}`);
  if (r.hasKnowledge) opts.push("knowledge=knowledge");
  const client = [
    r.endpoint !== DEFAULT_URL ? `base_url=os.environ.get("NATLAS_BASE_URL", ${lit(r.endpoint)})` : "",
    r.model !== "n-atlas" ? `model=${lit(r.model)}` : "",
  ].filter(Boolean);
  return [
    `# natlas.py — the N-ATLAS SDK: one file, standard library only (download it below), or:`,
    `#   pip install "git+https://github.com/lumpyspace/N-atlas-launchpad#subdirectory=sdk/python"`,
    `# Reads NATLAS_BASE_URL, NATLAS_MODEL and NATLAS_API_KEY; defaults to local Ollama.`,
    client.some((c) => c.includes("os.environ")) ? "import os\n" : null,
    r.hasKnowledge ? `from natlas import Knowledge, Natlas` : `from natlas import Natlas`,
    ``,
    `natlas = Natlas(${client.join(", ")})`,
    r.hasKnowledge
      ? `# Your documents — knowledge/passages.json comes with Ship → Download.\nknowledge = Knowledge.from_json("knowledge/passages.json")`
      : null,
    `SYSTEM_PROMPT = ${block(r.system.trim())}`,
    ``,
    `reply = natlas.chat(`,
    `    ${lit(r.message || "Hello!")},`,
    ...opts.map((o) => `    ${o},`),
    `)`,
    `print(reply.text)`,
    r.hasKnowledge ? `print("Sources:", [f"{s.source} #{s.index}" for s in reply.sources])` : null,
    ``,
    `# Stream instead:  for d in natlas.stream(question, **options): print(d, end="", flush=True)`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

function snippet(lang: Lang, r: CodeRequest): string {
  if (lang === "sdk-js") return sdkSnippet("js", r);
  if (lang === "sdk-py") return sdkSnippet("python", r);
  const body = requestBody(r);
  const json = JSON.stringify(body, null, 2);
  switch (lang) {
    case "curl":
      // Single quotes in the JSON are escaped for the shell's single-quoted string.
      return `curl ${r.endpoint}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $NATLAS_API_KEY" \\
  -d '${json.replace(/'/g, "'\\''")}'`;
    case "js":
      return `// Node 18+ (built-in fetch). Works with Ollama, vLLM or any OpenAI-compatible N-ATLAS server.
const NATLAS_ENDPOINT = process.env.NATLAS_ENDPOINT ?? "${r.endpoint}";

const res = await fetch(\`\${NATLAS_ENDPOINT}/chat/completions\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.NATLAS_API_KEY ?? ""}\`,
  },
  body: JSON.stringify(${json.replace(/\n/g, "\n  ")}),
});
const data = await res.json();
console.log(data.choices[0].message.content);`;
    case "python":
      return `# pip install requests
import os
import requests

NATLAS_ENDPOINT = os.environ.get("NATLAS_ENDPOINT", "${r.endpoint}")

resp = requests.post(
    f"{NATLAS_ENDPOINT}/chat/completions",
    headers={"Authorization": f"Bearer {os.environ.get('NATLAS_API_KEY', '')}"},
    json=${toPython(body, 4)},
    timeout=300,
)
resp.raise_for_status()
print(resp.json()["choices"][0]["message"]["content"])`;
  }
}

/** JSON → Python literal (True/False/None), indented to sit inside a call. */
function toPython(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  return JSON.stringify(value, null, 4)
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bnull\b/g, "None")
    .replace(/\n/g, `\n${pad}`);
}

export function GetCode({ request, onClose }: { request: CodeRequest; onClose: () => void }) {
  const t = useT();
  const [lang, setLang] = useState<Lang>("sdk-js");
  const isSdk = lang === "sdk-js" || lang === "sdk-py";
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const code = snippet(lang, request);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is still selectable */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("Get code")}
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="font-semibold text-slate-800">{t("Call N-ATLAS from your code")}</h2>
            <p className="text-xs text-slate-500">
              {isSdk
                ? t("Your system prompt, language and settings, through the N-ATLAS SDK.")
                : t("The exact request the Playground sends — your system prompt, language and settings.")}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t("Close")}>
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 px-5 pt-3">
          {TABS.map(([l, label]) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                lang === l ? "bg-forge-50 text-forge-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={copy}
            className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {copied ? "✓ " + t("Copied") : t("Copy")}
          </button>
        </div>
        <pre className="m-5 mt-3 max-h-[60vh] overflow-auto rounded-lg bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">
          <code>{code}</code>
        </pre>
        {isSdk && (
          <div className="-mt-2 flex flex-wrap items-center gap-2 px-5 pb-4 text-xs text-slate-500">
            <button
              onClick={() => downloadSdk(lang === "sdk-js" ? "natlas.js" : "natlas.py")}
              className="rounded-md bg-forge-600 px-3 py-1.5 font-medium text-white hover:bg-forge-700"
            >
              ⬇ {t("Download {file}", { file: lang === "sdk-js" ? "natlas.js" : "natlas.py" })}
            </button>
            {lang === "sdk-js" && (
              <button onClick={() => downloadSdk("natlas.d.ts")} className="text-forge-700 hover:underline">
                {t("TypeScript types")}
              </button>
            )}
            <span>
              {t("One file, no dependencies. Language hints, answers from your documents, streaming, and errors that say how to fix them.")}{" "}
              <a
                href={`https://github.com/lumpyspace/N-atlas-launchpad/tree/master/sdk/${lang === "sdk-js" ? "js" : "python"}`}
                target="_blank"
                rel="noreferrer"
                className="text-forge-700 hover:underline"
              >
                {t("Docs ↗")}
              </a>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
