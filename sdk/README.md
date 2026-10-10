# N-ATLAS SDK

Small, zero-dependency clients for **N-ATLAS**, Nigeria's open LLM, for any OpenAI-compatible server that runs it (Ollama, llama.cpp, vLLM, a hosted GPU).

| | Docs | File |
|---|---|---|
| JavaScript (Node 18+, Deno, Bun, browsers) | [js/README.md](js/README.md) | [`js/natlas.js`](js/natlas.js) + [`natlas.d.ts`](js/natlas.d.ts) |
| Python 3.8+ (standard library only) | [python/README.md](python/README.md) | [`python/natlas.py`](python/natlas.py) |

Both have the same features: N-ATLAS's recommended settings, language hints for Yoruba, Hausa, Igbo and Pidgin, answers from your documents with sources, conversations that fit the 8,092-token context, streaming, retries, and errors with a `code` and a `hint`.

N-ATLAS Launchpad ships these exact files in every exported project and offers them for download on the Ship page and in Test → Get code.

## Developing

```bash
# from the repo root
cd backend && node --import tsx --test ../tests/sdk.test.ts    # JavaScript tests
cd sdk/python && python -m unittest -v test_natlas             # Python tests
node sdk/sync.mjs                                              # copy the SDK into the Launchpad frontend
```

Keep the two SDKs in step: the same options, defaults, prompt wording and search behaviour.
