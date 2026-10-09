import { useState } from "react";

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
}

type Lang = "curl" | "js" | "python";

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

function snippet(lang: Lang, r: CodeRequest): string {
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
  const [lang, setLang] = useState<Lang>("js");
  const [copied, setCopied] = useState(false);
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
      aria-label="Get code"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="font-semibold text-slate-800">Call N-ATLAS from your code</h2>
            <p className="text-xs text-slate-500">
              The exact request the Playground sends — your system prompt, language and settings.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex items-center gap-1 px-5 pt-3">
          {(["js", "python", "curl"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                lang === l ? "bg-forge-50 text-forge-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {l === "js" ? "JavaScript" : l === "python" ? "Python" : "curl"}
            </button>
          ))}
          <button
            onClick={copy}
            className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <pre className="m-5 mt-3 max-h-[60vh] overflow-auto rounded-lg bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
