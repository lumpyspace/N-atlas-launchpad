# natlas (JavaScript)

A small, zero-dependency client for **N-ATLAS**, Nigeria's open LLM. One file, works in Node 18+, Deno, Bun and browsers, with any OpenAI-compatible server that runs N-ATLAS (Ollama, llama.cpp, vLLM, a hosted GPU).

```js
import { Natlas } from "./natlas.js";

const natlas = new Natlas(); // NATLAS_BASE_URL, NATLAS_MODEL, NATLAS_API_KEY — defaults to local Ollama
const { text } = await natlas.chat("How I fit register my business for Lagos?", { language: "pid" });
console.log(text);
```

## Get it

Copy one file into your project — it has no dependencies:

```bash
curl -O https://raw.githubusercontent.com/lumpyspace/N-atlas-launchpad/master/sdk/js/natlas.js
```

Projects exported from N-ATLAS Launchpad already include it as `src/natlas.js`. Add `natlas.d.ts` alongside for TypeScript types.

## What it does for you

| | |
|---|---|
| **N-ATLAS defaults** | temperature 0.1 and repetition penalty 1.12, from the model card |
| **Languages** | `language: "yo" \| "ha" \| "ig" \| "pid" \| "en"` adds "Respond in Yoruba." etc. |
| **Your documents** | `knowledge` finds the best passages and tells N-ATLAS to answer only from them; the result says which it used |
| **Context window** | long conversations are trimmed (oldest turns first) to fit 8,092 tokens |
| **Errors you can fix** | every error has a `code` and a `hint`: server not running, model missing, wrong URL, bad key, timeout |
| **Slow hardware** | 10-minute timeout by default (a CPU writes ~1–5 tokens a second); retries busy servers |

## Conversations

```js
const history = [
  { role: "user", content: "Wetin be the price of rice?" },
  { role: "assistant", content: "Which market you dey ask about?" },
  { role: "user", content: "Mile 12" },
];
const r = await natlas.chat(history, { system: "You help traders compare market prices." });
if (r.dropped) console.log(`(${r.dropped} old messages trimmed to fit)`);
```

## Streaming

```js
const s = natlas.stream("Tell me about Ọ̀ṣun-Òṣogbo grove", { language: "yo" });
for await (const delta of s) process.stdout.write(delta);
const { usage } = await s.done;
console.log(`\n${usage?.completionTokens} tokens`);
```

## Answer from your documents

```js
import { readFile } from "node:fs/promises";
import { Natlas, Knowledge } from "./natlas.js";

const kb = new Knowledge();
kb.add("prices.txt", await readFile("prices.txt", "utf8"));
// or, from a Launchpad export:
// const kb = Knowledge.fromJSON(await readFile("knowledge/passages.json", "utf8"));

const r = await natlas.chat("How much is a bag of rice?", { knowledge: kb });
console.log(r.text);
console.log("Sources:", r.sources.map((s) => `${s.source} #${s.index}`));
```

Search is keyword-based (BM25): no embedding model to download, it works offline, and it ignores accents so "kaaro" finds "káàárọ̀". If nothing matches, no facts are sent and `r.sources` is empty — a good moment to tell the user you don't know.

## Errors

```js
import { NatlasError } from "./natlas.js";

try {
  await natlas.chat("Hello");
} catch (e) {
  if (e instanceof NatlasError) console.error(e.code, "—", e.hint);
}
```

| `code` | Meaning |
|---|---|
| `unreachable` | nothing at `baseURL` — start Ollama (`ollama serve`) or fix `NATLAS_BASE_URL` |
| `model_missing` | the server doesn't have the model — `ollama list`, or set `NATLAS_MODEL` |
| `auth` | the API key was refused |
| `timeout` | took longer than `timeoutMs` |
| `too_long` | system prompt + facts don't fit the context window |
| `aborted` | you cancelled with `signal` |
| `empty`, `http`, `invalid` | empty reply, other HTTP error, bad option |

## Also included

- `natlas.generate(prompt, options)` — just the text
- `natlas.ping()` — check the server and model are ready
- `detectLanguage(text)` — `"en" | "yo" | "ha" | "ig" | "pid"`, to check N-ATLAS answered in the language you asked for (a heuristic; unreliable under ~10 words)
- `estimateTokens(text)`, `fitContext(messages)`, `chunkText(text)`, `tokenize(text)`

## Licence of the model

N-ATLAS is released under the N-ATLaS Terms of Use: no more than 1,000 active end-users in a rolling 30 days without a separate licence from Awarri Technologies. Read the terms on the [model card](https://huggingface.co/NCAIR1/N-ATLaS).
