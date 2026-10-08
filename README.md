# N-ATLAS Launchpad

**Build. Test. Secure. Deploy with N-ATLAS.**

N-ATLAS Launchpad turns an app idea into a tested, security-checked **N-ATLAS**
prototype — and sends the developer home with real, runnable code. It's a
**developer adoption tool** for **N-ATLAS**, Nigeria's open, multilingual LLM
(`NCAIR1/N-ATLaS`): a developer who has never used N-ATLAS can, in minutes,
describe what they want, build it, try it, evaluate it, attack it, improve it,
and export a starter project.

> Built for the **2026 NCAIR/NITDA National AI Innovation Challenge (NAIC)**.

The workflow:

```
Describe → Build → Try → Evaluate → Secure → Improve → Export
```

> **N-ATLAS is the model.** Launchpad never substitutes another LLM for N-ATLAS
> and pretends it is N-ATLAS. When real N-ATLAS isn't connected, the UI runs in a
> clearly-labelled **DEMO MODE** (scripted responses) — and says so.

---

## Why it exists

A developer with a Nigerian use case (university admissions, agriculture,
finance, legal info, customer support…) has no easy on-ramp to N-ATLAS, and no
way to check — *before shipping* — that their app speaks good Nigerian-context
English/Yoruba/Hausa/Igbo and resists prompt-injection and jailbreaks. Launchpad
is that on-ramp: discover where N-ATLAS fits your app, test it, and leave with
working code. Different models have different strengths; this helps you find
N-ATLAS's.

## The two realities we designed around

1. **No hosted N-ATLAS API exists.** N-ATLAS is open-weights (gated Llama-3 8B).
   You run it yourself and serve it over an OpenAI-compatible endpoint (local
   Ollama, a GPU server, or an HF Inference Endpoint). Launchpad reaches it
   through one swappable `NAtlasProvider`, so **demo / local-live / hosted-GPU
   are just configuration** (`NATLAS_PROVIDER` + a UI badge).
2. **CPU inference is slow** (~1.4 tok/s locally), far too slow for the ~40
   sequential model calls a full demo makes. So **DEMO MODE is first-class**: it
   runs the *real* evaluation and security engines against a scripted provider
   that responds story-coherently. Scores — including the Secure→Improve
   before/after — are **computed, never faked**. Flip `NATLAS_PROVIDER=http` to
   prove one genuine N-ATLAS call.

## Architecture (short)

`frontend (React/Vite/Tailwind wizard)` → `backend (Node/Express)` →
**`NAtlasProvider`** → `demo | http (Ollama / GPU / HF) | mock`. Engines:
**blueprint** (idea → plan), **eval** (sector suites), **security** (attack
suite), **improve** (harden). Export runs client-side (JSZip). Full detail in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
frontend/   React + Vite + TypeScript + Tailwind — the Launchpad wizard
backend/    Node + Express + TypeScript — blueprint / eval / security / improve + provider
inference/  How to serve real N-ATLAS locally (Ollama) + Modelfile
docs/       Architecture + N-ATLAS integration guide
```

## Run it locally

```bash
# 1. Backend (defaults to DEMO mode — full workflow, no GPU needed)
cd backend
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run dev                   # http://localhost:8787

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

Open <http://localhost:5173> and walk the workflow.

### Connecting real N-ATLAS (live mode)

1. Accept the license on <https://huggingface.co/NCAIR1/N-ATLaS> (gated model).
2. Serve it over an OpenAI-compatible endpoint — see
   [`inference/README.md`](inference/README.md) (Ollama for local CPU; vLLM/TGI/HF
   for GPU). A **GPU** runs this 8B model at ~30–80 tok/s — fast enough for live
   use; the ~1.4 tok/s figure is a CPU limitation, not an N-ATLAS one.
3. In `backend/.env` set `NATLAS_PROVIDER=http`, `NATLAS_ENDPOINT`,
   `NATLAS_MODEL` (and `NATLAS_API_KEY` if your server needs one).
4. Verify: `cd backend && npm run healthcheck`. The UI badge switches to
   **LIVE N-ATLAS**.

## What's implemented

- **Describe → Blueprint** — deterministic, sector-aware blueprint (name,
  purpose, Nigerian-context notes, risks, and a generated **system prompt** with
  a planted security canary). `POST /api/blueprint`.
- **Playground** — 3-pane chat with your app's system prompt; LIVE/DEMO badge.
- **Evaluate** — sector suites (education / finance / agriculture / legal /
  customer-support / general) across **AI quality, Nigerian context, language,
  reliability, safety**, run against the app's own system prompt.
  `POST /api/evaluate`.
- **Secure** — ~15 controlled attacks (prompt injection, system-prompt
  extraction, impersonation, sensitive-info, jailbreak, data leakage) with
  severity, explanation, and mitigation. `POST /api/security`.
- **Improve** — hardens the system prompt against the categories that failed,
  then **re-tests** for a real before/after. `POST /api/improve`.
- **Export** — a real, runnable **JavaScript or Python** starter project (N-ATLAS
  client, system prompt, eval + security tests, README) as a downloadable `.zip`.

## Evaluation & security methodology

- **Evaluation** uses declarative checks (keyword / refusal / format /
  min-length), diacritic- and case-insensitive so ASCII values match accented
  Yoruba/Hausa/Igbo. Transparent and fast; an LLM judge can be plugged in later
  for deeper scoring.
- **Security detection is deterministic — no second LLM judge.** Every generated
  system prompt carries a secret **canary**; if a response echoes it, that's
  provable system-prompt leakage. Injection tests embed a **sentinel** token; if
  the response emits it, the injection provably succeeded. Jailbreak/sensitive
  tests check for refusal. This makes verdicts reproducible and explainable.

## Honesty rules this repo follows

- Never present DEMO/mock output as real N-ATLAS (every result carries `isMock`).
- Never fabricate scores — before/after is always re-computed by re-running.
- Never use another LLM as a hidden stand-in for N-ATLAS.
- Never claim N-ATLAS universally beats other models; help developers *discover
  where it works* for their app.

## Roadmap

- Hosted shared N-ATLAS GPU endpoint so site visitors get live inference.
- LLM-as-judge scoring option for subtler quality/context checks.
- Larger multilingual + safety suites; run persistence and shareable reports.
