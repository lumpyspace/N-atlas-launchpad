# natlas (Python)

A small, zero-dependency client for **N-ATLAS**, Nigeria's open LLM. One file, standard library only, Python 3.8+, with any OpenAI-compatible server that runs N-ATLAS (Ollama, llama.cpp, vLLM, a hosted GPU).

```python
from natlas import Natlas

natlas = Natlas()  # NATLAS_BASE_URL, NATLAS_MODEL, NATLAS_API_KEY — defaults to local Ollama
print(natlas.chat("How I fit register my business for Lagos?", language="pid").text)
```

## Get it

```bash
pip install "git+https://github.com/lumpyspace/N-atlas-launchpad#subdirectory=sdk/python"
```

Or copy the single file `natlas.py` into your project. Projects exported from N-ATLAS Launchpad already include it.

## What it does for you

| | |
|---|---|
| **N-ATLAS defaults** | temperature 0.1 and repetition penalty 1.12, from the model card |
| **Languages** | `language="yo" \| "ha" \| "ig" \| "pid" \| "en"` adds "Respond in Yoruba." etc. |
| **Your documents** | `knowledge=` finds the best passages and tells N-ATLAS to answer only from them; the result says which it used |
| **Context window** | long conversations are trimmed (oldest turns first) to fit 8,092 tokens |
| **Errors you can fix** | every error has a `code` and a `hint`: server not running, model missing, wrong URL, bad key, timeout |
| **Slow hardware** | 10-minute timeout by default (a CPU writes ~1–5 tokens a second); retries busy servers |

## Conversations

```python
history = [
    {"role": "user", "content": "Wetin be the price of rice?"},
    {"role": "assistant", "content": "Which market you dey ask about?"},
    {"role": "user", "content": "Mile 12"},
]
r = natlas.chat(history, system="You help traders compare market prices.")
if r.dropped:
    print(f"({r.dropped} old messages trimmed to fit)")
```

## Streaming

```python
s = natlas.stream("Tell me about Ọ̀ṣun-Òṣogbo grove", language="yo")
for delta in s:
    print(delta, end="", flush=True)
print(f"\n{s.result.usage.completion_tokens} tokens")
```

## Answer from your documents

```python
from natlas import Natlas, Knowledge

kb = Knowledge()
kb.add("prices.txt", open("prices.txt", encoding="utf-8").read())
# or, from a Launchpad export:
# kb = Knowledge.from_json("knowledge/passages.json")

r = natlas.chat("How much is a bag of rice?", knowledge=kb)
print(r.text)
print("Sources:", [f"{s.source} #{s.index}" for s in r.sources])
```

Search is keyword-based (BM25): no embedding model to download, it works offline, and it ignores accents so "kaaro" finds "káàárọ̀". If nothing matches, no facts are sent and `r.sources` is empty.

## Errors

```python
from natlas import NatlasError

try:
    natlas.chat("Hello")
except NatlasError as e:
    print(e.code, "—", e.hint)
```

Codes: `unreachable`, `model_missing`, `auth`, `timeout`, `too_long`, `empty`, `http`, `invalid` — the same as the JavaScript SDK.

## Also included

- `natlas.generate(prompt, **options)` — just the text
- `natlas.ping()` — check the server and model are ready (returns latency in ms)
- `detect_language(text)` — `"en" | "yo" | "ha" | "ig" | "pid"`, a heuristic to check the reply language
- `estimate_tokens`, `fit_context`, `chunk_text`, `tokenize`

## Licence of the model

N-ATLAS is released under the N-ATLaS Terms of Use: no more than 1,000 active end-users in a rolling 30 days without a separate licence from Awarri Technologies. Read the terms on the [model card](https://huggingface.co/NCAIR1/N-ATLaS).
