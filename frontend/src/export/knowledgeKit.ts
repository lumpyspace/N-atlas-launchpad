/**
 * Knowledge in exported projects: the developer's passages as JSON plus a few
 * lines that load them into the N-ATLAS SDK's Knowledge search (the same BM25
 * search Launchpad uses), wired into the starter server's findFacts() and the
 * chat script.
 */

import type { KDoc } from "../utils/knowledge";

export function knowledgeFiles(docs: KDoc[], lang: "js" | "python"): Record<string, string> {
  if (!docs.length) return {};
  const passages = docs.flatMap((d) => d.chunks.map((c, i) => ({ source: d.name, index: i + 1, text: c.text })));
  return {
    "knowledge/passages.json": JSON.stringify(passages, null, 2) + "\n",
    ...(lang === "js" ? { "src/knowledge.js": JS_KNOWLEDGE } : { "knowledge_search.py": PY_KNOWLEDGE }),
  };
}

/**
 * Point the starter server's findFacts() stub at the knowledge search.
 * Returns the code unchanged if it has no stub (e.g. the game server).
 */
export function wireServer(serverCode: string): string {
  const stub = /async function findFacts\(question\) \{[\s\S]*?\n\}/;
  if (!stub.test(serverCode)) return serverCode;
  return (
    'import { searchKnowledge } from "./knowledge.js";\n' +
    serverCode.replace(
      stub,
      "async function findFacts(question) {\n  // The 3 most relevant passages from knowledge/passages.json (keyword search).\n  return searchKnowledge(question, 3);\n}",
    )
  );
}

export const JS_CHAT_WITH_KNOWLEDGE = `import { Natlas } from "./natlas.js";
import { knowledge } from "./knowledge.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const prompt = process.argv.slice(2).join(" ") || "Hello! What can you help me with?";
const stream = new Natlas().stream(prompt, { system: SYSTEM_PROMPT, knowledge });
for await (const delta of stream) process.stdout.write(delta);
const { sources } = await stream.done;
console.log(sources.length ? "\\n\\nSources: " + sources.map((s) => s.source + " #" + s.index).join(", ") : "\\n\\n(No matching passages in your documents.)");
`;

export const PY_CHAT_WITH_KNOWLEDGE = `import sys
from natlas import Natlas
from knowledge_search import knowledge
from system_prompt import SYSTEM_PROMPT

prompt = " ".join(sys.argv[1:]) or "Hello! What can you help me with?"
stream = Natlas().stream(prompt, system=SYSTEM_PROMPT, knowledge=knowledge)
for delta in stream:
    print(delta, end="", flush=True)
sources = stream.result.sources
print("\\n\\nSources: " + ", ".join(f"{s.source} #{s.index}" for s in sources) if sources else "\\n\\n(No matching passages in your documents.)")
`;

const JS_KNOWLEDGE = `// Your documents (knowledge/passages.json), searched with the N-ATLAS SDK's
// keyword search — the same search N-ATLAS Launchpad uses.
import { readFileSync } from "node:fs";
import { Knowledge } from "./natlas.js";

export const knowledge = Knowledge.fromJSON(readFileSync(new URL("../knowledge/passages.json", import.meta.url), "utf8"));

/** The k most relevant passages, labelled with their source — or "" if none match. */
export function searchKnowledge(query, k = 3) {
  return Knowledge.format(knowledge.search(query, k));
}
`;

const PY_KNOWLEDGE = `"""Your documents (knowledge/passages.json), searched with the N-ATLAS SDK's
keyword search — the same search N-ATLAS Launchpad uses."""
import os

from natlas import Knowledge

knowledge = Knowledge.from_json(os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge", "passages.json"))


def search_knowledge(query, k=3):
    """The k most relevant passages, labelled with their source — or "" if none match."""
    return Knowledge.format(knowledge.search(query, k))
`;
