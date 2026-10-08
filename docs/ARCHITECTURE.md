# Architecture

N-ATLAS Launchpad is a small, two-part system (React frontend + Express backend)
kept deliberately simple. A developer flows through a linear wizard; each step
calls a focused backend engine; everything reaches the model through one
swappable provider.

```
 User
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ Launchpad UI  (React + Vite + Tailwind, wizard)              │
│ Describe → Build → Try → Evaluate → Secure → Improve → Export │
│ central ProjectContext (localStorage)                         │
└───────────────┬──────────────────────────────────────────────┘
                │ REST /api
                ▼
┌──────────────────────────────────────────────────────────────┐
│ backend (Node + Express + TypeScript)                         │
│  blueprint │ eval (sector suites) │ security │ improve/harden  │
└───────────────┬──────────────────────────────────────────────┘
                │
         NAtlasProvider (one abstraction)
          ├─ ScriptedDemoProvider  (DEMO — scripted, isMock)
          ├─ HttpNAtlasProvider    (LIVE — Ollama / GPU / HF Endpoint)
          └─ MockNAtlasProvider    (placeholder for raw UI dev)

Export (Describe→…→Export) is generated client-side (JSZip) → .zip starter kit.
```

## Request flow per step

- **Describe → Build:** `POST /api/blueprint { description }` → classify sector
  (keywords) → fill a template → synthesize a **system prompt with a planted
  canary**. Deterministic; no model call.
- **Try:** `POST /api/generate { prompt, options:{ system } }` → provider.
- **Evaluate:** `POST /api/evaluate { sector, systemPrompt }` → `buildAppSuite`
  runs every case against the app's own system prompt (runner `systemOverride`),
  scored by declarative checks.
- **Secure:** `POST /api/security { systemPrompt }` → ~15 attacks → deterministic
  detectors (canary leak / obeyed sentinel / refusal) → severity-weighted score.
- **Improve:** `POST /api/improve { systemPrompt, failedCategories }` → appends a
  `SECURITY DIRECTIVES` block → client re-runs `/api/security` for a real
  before/after.
- **Export:** client builds a runnable JS/Python project from project state.

## Why these choices

- **Provider abstraction (`NAtlasProvider`).** N-ATLAS has no official API, so the
  way we reach it changes (demo now, local CPU, GPU later). The engines never
  change when hosting does — swap the implementation, not the app. Mode =
  `NATLAS_PROVIDER` env; the UI badge reads `provider.isMock`/`name`.
- **Demo mode is first-class and honest.** `ScriptedDemoProvider` returns
  story-coherent responses and branches on whether the system prompt has been
  hardened — so the *real* eval/security engines produce a *real* before/after
  without a GPU. Every result carries `isMock: true`.
- **Deterministic security detection.** A secret **canary** in each system prompt
  turns "did it leak?" into a substring check; injected **sentinels** turn "did
  it obey?" into one too. No second LLM judge needed; verdicts are reproducible.
- **OpenAI chat-completions wire format.** Ollama, vLLM, TGI and HF Endpoints all
  speak it, so one HTTP client reaches them all — hosting is a `.env` change.
- **Client-side export.** The ZIP is built in-browser (JSZip), so export works
  even on a static deploy with no backend.

## Folder layout

```
n-atlas-launchpad/   (repo dir: n-atlas-forge)
├─ frontend/
│  └─ src/
│     ├─ screens/     Landing, Describe, Blueprint, Evaluate, Secure, Improve, Export
│     ├─ components/   Playground, Stepper, ModeBadge
│     ├─ state/        ProjectContext (wizard state, localStorage)
│     ├─ ui/           Tailwind primitives (Button, Card, Badge, …)
│     └─ export/       starter-kit templates + JSZip builder
├─ backend/
│  └─ src/
│     ├─ blueprint/    idea → blueprint (sectors, generate)
│     ├─ eval/         types, checks, suites (+ sector suites), runner
│     ├─ security/     types, detectors, attack suite, runner
│     ├─ improve/      harden
│     ├─ providers/    NAtlasProvider + Http/Mock/ScriptedDemo + factory
│     ├─ shared/       prompt canary + hardening marker utilities
│     └─ routes/       health, generate, blueprint, evaluate, security, improve
├─ inference/   How to serve real N-ATLAS locally (Ollama) + Modelfile
└─ docs/        This file + the N-ATLAS integration guide
```
