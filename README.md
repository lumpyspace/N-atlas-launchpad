# N-ATLAS Forge

**Build. Test. Benchmark. Improve.**

A developer **security and evaluation platform** for applications built on
**N-ATLAS** — Nigeria's open, multilingual LLM (`NCAIR1/N-ATLaS`). N-ATLAS Forge
lets a developer run reliability and security tests against N-ATLAS, evaluate its
responses on Nigerian-context test cases, score them, compare before/after
improvements, and (eventually) export a shareable evaluation report.

> Built for the **2026 NCAIR/NITDA National AI Innovation Challenge (NAIC)**.

> **N-ATLAS is the model under test.** This project does **not** build another
> chatbot or LLM, and it never substitutes OpenAI/Claude/Gemini/Llama/Ollama for
> N-ATLAS and pretends it is N-ATLAS.

---

## Why it exists

Teams building on N-ATLAS have no easy way to know if their app behaves safely
and reliably — especially across Nigerian languages (Yoruba, Hausa, Igbo,
Nigerian-accented English). N-ATLAS Forge is the "test bench" that measures it.

## Architecture (short version)

`frontend (React/Vite)` → `backend (Node/Express REST)` → **`N-ATLAS server you
host`** (Ollama / vLLM / TGI / HF Endpoint). The backend reaches N-ATLAS only
through a swappable **`NAtlasProvider`** abstraction, so the serving method can
change without touching the evaluation logic. Full detail in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
frontend/   React + Vite + TypeScript + Tailwind — Phase-1 playground UI
backend/    Node + Express + TypeScript — REST API + provider abstraction
inference/  How to serve real N-ATLAS locally (Ollama/vLLM) + Modelfile
tests/      Provider-contract + mock-safety tests (eval suites come later)
docs/       Architecture + N-ATLAS integration guide
```

## N-ATLAS integration status

**Honest status:** there is **no official public N-ATLAS API**. N-ATLAS is a
**gated Llama-3 8B model on Hugging Face** that you run yourself. N-ATLAS Forge
is wired to call a self-hosted, OpenAI-compatible N-ATLAS endpoint — but **no
real N-ATLAS call has been made yet from this machine**, because serving the
model first requires accepting the HF license and converting/serving the weights
(this laptop has no GPU; CPU via Ollama is the local route).

Until you configure a real endpoint, the app runs on a **clearly-labelled MOCK
provider** so the UI is developable. Mock output is flagged (`isMock: true`) in
the API and shown with a loud warning banner in the UI — it can never be mistaken
for real N-ATLAS. Full details, licensing limits, and sources are in
[`docs/N-ATLAS-INTEGRATION.md`](docs/N-ATLAS-INTEGRATION.md).

## How to configure real N-ATLAS access

1. Accept the license on <https://huggingface.co/NCAIR1/N-ATLaS> (gated model).
2. Serve the model and get an OpenAI-compatible endpoint — see
   [`inference/README.md`](inference/README.md) (Ollama for local CPU, or
   vLLM/TGI/HF-Endpoint for GPU).
3. In `backend/.env`:
   ```
   NATLAS_PROVIDER=http
   NATLAS_ENDPOINT=http://localhost:11434/v1   # your server
   NATLAS_API_KEY=                              # if your server needs one
   NATLAS_MODEL=n-atlas                         # tag/id your server expects
   ```
4. Verify the chain: `cd backend && npm run healthcheck`.

## Run it locally

```bash
# 1. Backend (defaults to MOCK provider — safe out of the box)
cd backend
cp .env.example .env
npm install
npm run dev            # http://localhost:8787  (GET /api/health)

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:5173

# 3. Verify app -> N-ATLAS -> response
cd backend && npm run healthcheck
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

## What is currently implemented (Phase 1)

- ✅ Clean monorepo structure (`frontend` / `backend` / `inference` / `tests` / `docs`).
- ✅ `NAtlasProvider` abstraction + `HttpNAtlasProvider` (real) + `MockNAtlasProvider` (labelled).
- ✅ Environment-based configuration (no hard-coded secrets).
- ✅ REST API: `GET /api/health`, `POST /api/generate`.
- ✅ Health-check command verifying app → N-ATLAS → response.
- ✅ Minimal playground UI with a permanent REAL-vs-MOCK banner.
- ✅ Secret-redacting logger; basic error handling.
- ✅ Provider-contract / mock-safety tests.
- ✅ Integration research + documentation with sources.

## What is NOT yet implemented

- ⛔ Real N-ATLAS call verified from this machine (needs the model served first).
- ⛔ Evaluation engine: security/reliability suites, Nigerian-context test cases,
  scoring, pass/fail, findings.
- ⛔ Before/after comparison and shareable report export.
- ⛔ The full dashboard UI.

## Engineering rules this repo follows

- Never claim N-ATLAS integration works without a successful real request.
- Never fabricate test results. Never hard-code credentials.
- Never use another LLM as a hidden stand-in for N-ATLAS.
- TypeScript throughout; basic error handling; logs redact secrets.
