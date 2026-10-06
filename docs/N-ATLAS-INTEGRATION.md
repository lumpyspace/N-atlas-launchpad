# N-ATLAS Integration Guide

This document records **exactly how N-ATLAS can be accessed today** and how
N-ATLAS Forge connects to it. Everything here is based on the official sources
listed at the bottom — nothing is invented.

> **Status (verified 2026-10-06): there is NO official public N-ATLAS REST API
> and NO official hosted inference endpoint.** N-ATLAS is distributed as a
> **gated open-weights model on Hugging Face** that you run/serve yourself.

---

## 1. What N-ATLAS actually is

- **Model:** `NCAIR1/N-ATLaS` on Hugging Face.
- **Builder:** NCAIR (National Centre for AI & Robotics, an NITDA SPV), with
  Awarri Technologies, under Nigeria's Federal Ministry of Communications,
  Innovation & Digital Economy. Unveiled as "N-ATLAS V1" at UNGA80 (Sept 2025).
- **Architecture:** fine-tune of **Llama-3 8B** (8B parameters).
- **Weights:** `safetensors`, **BF16** precision.
- **Context length:** ~8,092 tokens. Vocab 128,256; hidden size 4,096.
- **Training:** supervised fine-tuning on ~392M multilingual instruction tokens.
- **Languages:** Nigerian-accented English + **Yoruba, Hausa, Igbo**.

## 2. Access & licensing requirements

- **Gated model.** You must sign in to Hugging Face, open the model page, and
  **accept the license / share contact info** before you can download weights.
- **License:** a custom **"Open-Source Research and Innovation License"**
  (inspired by Apache-2.0 / MIT, with restrictions). Key practical limits seen
  on the model card:
  - usage limited to organisations with **≤ 1,000 active end-users**;
  - **commercial use requires a separate licensing agreement**.
- For a competition MVP (research/demo, well under 1,000 users) this is fine,
  but **read the license on the model page yourself before any public launch.**

## 3. Is there an API / hosted endpoint?

- **No official public REST API.** The NCAIR LLM page and the N-ATLAS site only
  link to the Hugging Face repo; neither documents an API, key, or playground.
- **No official serverless Inference API / inference provider** is deployed for
  the gated repo at time of writing. (Community Spaces exist but are not an
  official, stable API to build on.)
- **Conclusion:** to use N-ATLAS programmatically you **serve it yourself** and
  call *your* endpoint. That is what this project is built around.

## 4. How N-ATLAS Forge connects (the abstraction)

The backend reaches N-ATLAS **only** through `NAtlasProvider`
(`backend/src/providers/NAtlasProvider.ts`). Two implementations exist:

| Provider | File | Real N-ATLAS? | Use |
|---|---|---|---|
| `HttpNAtlasProvider` | `HttpNAtlasProvider.ts` | ✅ yes | talks to your self-hosted, OpenAI-compatible N-ATLAS endpoint |
| `MockNAtlasProvider` | `MockNAtlasProvider.ts` | ❌ no | clearly-labelled fake text for frontend dev only |

We standardised on the **OpenAI chat-completions shape** (`/v1/chat/completions`)
because every realistic way to serve N-ATLAS exposes it (Ollama, vLLM, TGI, HF
Inference Endpoints). Swapping the hosting method is a `.env` change, not a code
change — which is the whole point of the abstraction.

### Environment variables (our contract — not an official N-ATLAS spec)

```
NATLAS_PROVIDER=http            # "http" (real) or "mock"
NATLAS_ENDPOINT=                # base URL of YOUR N-ATLAS server, e.g. http://localhost:11434/v1
NATLAS_API_KEY=                 # optional bearer token (HF endpoints); blank for local Ollama
NATLAS_MODEL=NCAIR1/N-ATLaS     # model id/tag your server expects
```

## 5. Ways to serve N-ATLAS (pick one)

### Option A — Local CPU via Ollama (recommended for this machine)
This machine has **no NVIDIA GPU** (Intel UHD integrated) but **16GB RAM and
Ollama already installed**, so a quantized N-ATLaS runs on CPU — slow but enough
to demo. You must convert the gated safetensors to GGUF first. See
[`../inference/README.md`](../inference/README.md). Then:
```
NATLAS_PROVIDER=http
NATLAS_ENDPOINT=http://localhost:11434/v1
NATLAS_MODEL=n-atlas
```

### Option B — Cloud GPU (best quality, costs money)
Serve the full BF16 model with **vLLM or TGI** on a rented GPU (RunPod, Lambda,
Colab Pro, Kaggle), or deploy a **Hugging Face Inference Endpoint** (dedicated).
An 8B model in fp16 needs **~16GB VRAM** (e.g. one T4/A10/L4). Then:
```
NATLAS_PROVIDER=http
NATLAS_ENDPOINT=https://<your-endpoint>/v1
NATLAS_API_KEY=<token-if-required>
NATLAS_MODEL=NCAIR1/N-ATLaS
```

### Option C — Direct Python `transformers` (reference only)
The model card's official snippet loads the model in-process with
`transformers`. That is Python, not a server, so it doesn't fit our Node backend
directly — but it's the canonical proof the weights work. If you prefer Python
serving, wrap it in a small FastAPI OpenAI-compatible server and use Option B's
env config pointed at `http://localhost:8000/v1`.

## 6. Verifying the real connection

```
cd backend
npm run healthcheck
```
This runs **application → N-ATLAS → response** and prints whether you reached
**real N-ATLAS** or the **mock**. It exits non-zero on failure. We only ever
claim "N-ATLAS integration works" after this passes against a real endpoint.

## 7. Hardware summary

| Route | Needs | Notes |
|---|---|---|
| Ollama CPU (Q4) | ~16GB RAM, ~5–6GB disk | works on this machine; slow (~seconds/token region) |
| GPU fp16 | ~16GB VRAM | full quality; rent a T4/A10/L4 or use HF Endpoint |

## 8. Sources

- Hugging Face model card: <https://huggingface.co/NCAIR1/N-ATLaS>
- NCAIR LLM page: <https://ncair.nitda.gov.ng/llm/>
- N-ATLAS site: <https://n-atlas.ncair.nitda.gov.ng/>
- NAIC 2026 challenge: <https://ncair.nitda.gov.ng/naic/>
- Launch coverage: <https://techcabal.com/2025/09/25/nigerian-government-awarri-launch-n-atlas/>,
  <https://techafricanews.com/2025/09/22/nigeria-unveils-n-atlas-v1-a-multilingual-open-source-large-language-model-at-unga80/>
- FMCIDE announcement: <https://fmcide.gov.ng/nigeria-launches-landmark-ai-model-powered-by-awarri-to-advance-languages-and-ai-at-scale/>
