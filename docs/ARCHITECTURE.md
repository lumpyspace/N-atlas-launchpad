# Architecture

N-ATLAS Forge is a small, three-part system kept deliberately simple so a
learning developer can maintain it.

```
┌──────────────┐     REST /api      ┌──────────────┐   OpenAI-compatible   ┌─────────────────┐
│  frontend    │  ───────────────▶  │  backend     │  ─────────────────▶   │  N-ATLAS server │
│ React+Vite   │  ◀───────────────  │ Node+Express │  ◀─────────────────   │ (Ollama/vLLM/HF)│
│ (playground) │    JSON results    │  TypeScript  │   completions JSON    │  = real N-ATLAS │
└──────────────┘                    └──────┬───────┘                       └─────────────────┘
                                           │
                                    NAtlasProvider (abstraction)
                                      ├─ HttpNAtlasProvider  (real)
                                      └─ MockNAtlasProvider  (clearly-labelled fake)
```

## Why these choices

- **Provider abstraction (`NAtlasProvider`).** N-ATLAS has no official API, so
  the *way* we reach it will change (local CPU now, GPU endpoint later). The
  interface means the evaluation engine we build next never has to change when
  the hosting does. Swap the implementation, not the app.
- **OpenAI chat-completions wire format.** Every realistic N-ATLAS serving layer
  (Ollama, vLLM, TGI, HF Endpoints) speaks it, so one HTTP client reaches them
  all. Hosting becomes a `.env` change.
- **`isMock` on every result.** Honesty is a hard requirement. Mock output is
  flagged at the data layer and surfaced in the API and UI, so it can never be
  mistaken for a genuine N-ATLAS response.
- **Separate frontend/backend.** Frontend can deploy to Vercel; the backend
  (which needs to reach a model server) deploys separately. In dev, Vite proxies
  `/api` to the backend to avoid CORS friction.
- **Minimal dependencies.** Backend: express, cors, dotenv + tsx/typescript.
  Frontend: React, Vite, Tailwind. Nothing else until a real need appears.

## Folder layout

```
n-atlas-forge/
├─ frontend/     React + Vite + TS + Tailwind playground (Phase 1 UI)
├─ backend/      Node + Express + TS REST API and provider abstraction
│  └─ src/providers/   NAtlasProvider + Http/Mock implementations + factory
├─ inference/    How to serve real N-ATLAS locally (Ollama/vLLM) + Modelfile
├─ tests/        Test suites (provider contract now; eval cases later)
└─ docs/         This file + the N-ATLAS integration guide
```

## What comes next (not built yet)

The **evaluation engine** — security/reliability test suites, Nigerian-context
test cases, scoring, pass/fail, findings, before/after comparison, and a
shareable report — will sit in the backend behind the same `NAtlasProvider`.
It is intentionally out of scope for Phase 1.
