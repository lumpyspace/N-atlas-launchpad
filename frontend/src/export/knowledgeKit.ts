/**
 * Knowledge in exported projects: the developer's passages as JSON plus a
 * small BM25 search module (JS and Python) that mirrors utils/knowledge.ts,
 * wired into the starter server's findFacts() and the chat script.
 *
 * Code blocks are String.raw so regex backslashes survive; they avoid `${}`.
 */

import type { KDoc } from "../utils/knowledge";

export function knowledgeFiles(docs: KDoc[], lang: "js" | "python"): Record<string, string> {
  if (!docs.length) return {};
  const passages = docs.flatMap((d) => d.chunks.map((c, i) => ({ source: d.name, index: i + 1, text: c.text })));
  return {
    "knowledge/passages.json": JSON.stringify(passages, null, 2) + "\n",
    ...(lang === "js" ? { "src/knowledge.js": JS_SEARCH } : { "knowledge_search.py": PY_SEARCH }),
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

export const JS_CHAT_WITH_KNOWLEDGE = String.raw`import { generate } from "./natlas.js";
import { searchKnowledge } from "./knowledge.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

const prompt = process.argv.slice(2).join(" ") || "Hello! What can you help me with?";
const facts = searchKnowledge(prompt, 3);
const system = facts
  ? SYSTEM_PROMPT + "\n\nAnswer only from these facts. If they don't cover the question, say so:\n" + facts
  : SYSTEM_PROMPT;
console.log(await generate(prompt, { system }));
`;

export const PY_CHAT_WITH_KNOWLEDGE = String.raw`import sys
from natlas import generate
from knowledge_search import search_knowledge
from system_prompt import SYSTEM_PROMPT

prompt = " ".join(sys.argv[1:]) or "Hello! What can you help me with?"
facts = search_knowledge(prompt, 3)
system = SYSTEM_PROMPT
if facts:
    system += "\n\nAnswer only from these facts. If they don't cover the question, say so:\n" + facts
print(generate(prompt, system=system))
`;

const JS_SEARCH = String.raw`// Keyword search (BM25) over knowledge/passages.json — the same search
// N-ATLAS Launchpad uses. Accent-insensitive, with light word-form matching.
import { readFileSync } from "node:fs";

const PASSAGES = JSON.parse(readFileSync(new URL("../knowledge/passages.json", import.meta.url), "utf8"));

const STOPWORDS = new Set(
  "a an the and or but if of to in on at for from by with about as is are was were be been being do does did have has had i you he she it we they me my your our their this that these those what which who whom how when where why can could will would should may might must not no yes so than then there here just also into over under up down out more most some any all each other such only own same very s t don wetin abeg dey na wey una dem e".split(" "),
);

function stem(w) {
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  for (const suffix of ["ation", "ion", "ing", "ed", "or", "er", "ly"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) return w.slice(0, -suffix.length);
  }
  return w;
}

export function tokenize(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

const DOCS = PASSAGES.map((p) => ({ ...p, terms: tokenize(p.text) }));
const AVG = DOCS.reduce((s, d) => s + d.terms.length, 0) / (DOCS.length || 1) || 1;
const DF = new Map();
for (const d of DOCS) for (const t of new Set(d.terms)) DF.set(t, (DF.get(t) || 0) + 1);

/** The k most relevant passages, labelled with their source — or "" if none match. */
export function searchKnowledge(query, k = 3) {
  const q = [...new Set(tokenize(query))];
  const N = DOCS.length;
  const scored = DOCS.map((d) => {
    const tf = new Map();
    for (const t of d.terms) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = DF.get(term) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * 2.4) / (f + 1.4 * (0.25 + (0.75 * d.terms.length) / AVG)));
    }
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ d }) => "[" + d.source + " — passage " + d.index + "]\n" + d.text)
    .join("\n\n");
}
`;

const PY_SEARCH = String.raw`"""Keyword search (BM25) over knowledge/passages.json — the same search
N-ATLAS Launchpad uses. Accent-insensitive, with light word-form matching."""
import json
import math
import os
import re
import unicodedata

_HERE = os.path.dirname(__file__)
with open(os.path.join(_HERE, "knowledge", "passages.json"), encoding="utf-8") as f:
    PASSAGES = json.load(f)

STOPWORDS = set(
    "a an the and or but if of to in on at for from by with about as is are was were be been being do does did have has had i you he she it we they me my your our their this that these those what which who whom how when where why can could will would should may might must not no yes so than then there here just also into over under up down out more most some any all each other such only own same very s t don wetin abeg dey na wey una dem e".split()
)
SUFFIXES = ["ation", "ion", "ing", "ed", "or", "er", "ly"]


def stem(w):
    if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
        w = w[:-1]
    for suffix in SUFFIXES:
        if w.endswith(suffix) and len(w) - len(suffix) >= 4:
            return w[: -len(suffix)]
    return w


def tokenize(text):
    t = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()
    words = re.split(r"[^\w]+|_", t)
    return [stem(w) for w in words if len(w) > 1 and w not in STOPWORDS]


_DOCS = [dict(p, terms=tokenize(p["text"])) for p in PASSAGES]
_AVG = (sum(len(d["terms"]) for d in _DOCS) / len(_DOCS)) if _DOCS else 1
_DF = {}
for _d in _DOCS:
    for _t in set(_d["terms"]):
        _DF[_t] = _DF.get(_t, 0) + 1


def search_knowledge(query, k=3):
    """The k most relevant passages, labelled with their source — or "" if none match."""
    q = set(tokenize(query))
    n_docs = len(_DOCS)
    scored = []
    for d in _DOCS:
        tf = {}
        for t in d["terms"]:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for term in q:
            f = tf.get(term)
            if not f:
                continue
            n = _DF.get(term, 0)
            idf = math.log(1 + (n_docs - n + 0.5) / (n + 0.5))
            score += idf * ((f * 2.4) / (f + 1.4 * (0.25 + 0.75 * len(d["terms"]) / (_AVG or 1))))
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda s: -s[0])
    return "\n\n".join(f"[{d['source']} — passage {d['index']}]\n{d['text']}" for _, d in scored[:k])
`;
