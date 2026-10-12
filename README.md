# N-ATLAS Launchpad

Describe your business or app idea in **Yoruba, Hausa, Igbo or English**, and
Launchpad turns it into something real that runs on **N-ATLAS**, Nigeria's open
language model: a published website with an assistant that answers your
customers in their own language, or, for developers, a tested and
security-checked N-ATLAS integration with code to take away.

**Try it:** https://n-atlas-sites.vercel.app

> Built for the 2026 NCAIR/NITDA National AI Innovation Challenge, Problem
> Statement 1: Developer Infrastructure.

## What it does

**Simple mode** is for business owners. Describe the business, and Launchpad
plans it and drafts a website with pages for prices, questions and contact
details. You check each page, press Publish, and get a link anyone can open on
a phone. The assistant on every page answers customers in English, Yoruba,
Hausa or Igbo, using only the facts you approved, and orders land in your
inbox.

**Advanced mode** is for developers. On top of the above you get:

- a **prompt studio** with tips for fixing common prompt problems,
- a **playground** for chatting with N-ATLAS in any of the four languages,
- **test suites** with checks for language, facts and length,
- a **security check** that throws prompt-injection attacks at your prompt,
- side-by-side **model comparison**,
- and **Get code**: working JavaScript, Python or curl, using our small SDK
  (`sdk/`), so you can call N-ATLAS from your own app.

The whole interface, including the helper chat on every page, is available in
English, Yoruba, Hausa and Igbo.

## How it works

N-ATLAS has no official hosted API, so we serve the official weights
(`NCAIR1/N-ATLaS`) ourselves with vLLM on a GPU (`inference/modal_natlas.py`).
The app pairs it with Groq:

- **N-ATLAS** reads what people write in Yoruba, Hausa and Igbo, and says every
  reply back in their language. It also translates whole websites.
- **Groq** does the thinking: it drafts sites and plans and works out each
  answer from the owner's approved facts. Google Gemini is a backup.

Every line N-ATLAS translates is checked before anyone sees it. It must keep
every number and price exactly, be in the right language, and add nothing new.
If it fails, Groq translates that line instead; if no model is free, the line
stays in English so the facts are still right.

## Run it locally

You need Node.js 20 or newer, a free Groq key from console.groq.com, and an
N-ATLAS server (a GPU via `inference/modal_natlas.py`, or Ollama on a laptop,
which works but is slow; see `inference/README.md`).

```
npm install --prefix backend
npm install --prefix frontend
cp backend/.env.example backend/.env    # then fill in the N-ATLAS details and your Groq key
npm run dev --prefix backend            # http://localhost:8788
npm run dev --prefix frontend           # http://localhost:5174
```

Check the connection with `npm run healthcheck` in `backend/`, and run the tests
with `node --import tsx --test ../tests/*.test.ts` from the same folder.

## Documentation

- [Technical documentation](docs/submission/technical-documentation.pdf):
  architecture, settings, hosting on Vercel, serving N-ATLAS, the API.
- [N-ATLAS integration evidence](docs/submission/n-atlas-integration-evidence.pdf):
  recorded live runs and a benchmark in Hausa, Yoruba and Igbo, with honest
  notes on what N-ATLAS gets wrong.
- [Contributing](CONTRIBUTING.md)

## Licence

The code is [MIT-licensed](LICENSE). The N-ATLAS model has its own licence from
NCAIR and Awarri, which you accept on Hugging Face before downloading it.

Launchpad is powered by N-ATLAS and Groq, with Google Gemini as a backup. It is
an independent project, not affiliated with NCAIR, Awarri, Groq or Google.
