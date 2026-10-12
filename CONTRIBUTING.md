# Contributing to N-ATLAS Launchpad

Thanks for wanting to help. Launchpad is meant to make N-ATLAS easier for
Nigerian developers and small businesses to use, so contributions from people
who speak Yoruba, Hausa or Igbo are especially welcome — including ones that
are only about language, not code.

## Ways to help

- **Fix a translation.** The interface text lives in `frontend/src/i18n/`
  (`yo.ts`, `ha.ts`, `ig.ts`). The English text is the key and your
  translation is the value. Most of these were written with AI help and need
  native speakers to check them.
- **Report where N-ATLAS gets something wrong.** Open an issue with what you
  asked, in which language, what came back, and what it should have said. These
  examples are how we improve the checks.
- **Fix a bug or add a feature.** Open an issue first for anything large, so we
  can agree on the approach before you spend time on it.

## Getting set up

Follow "Run it locally" in the [README](README.md). You'll need Node.js 20 or
newer, a Groq API key, and an N-ATLAS endpoint (the README explains the
options).

## Before you open a pull request

1. Run the tests and make sure they pass:
   ```
   cd backend
   node --import tsx --test ../tests/*.test.ts
   ```
2. Check the types:
   ```
   cd frontend && npx tsc -b
   ```
3. If you added or changed any text people see, add its Yoruba, Hausa and
   Igbo translations too. A test fails if a string is missing a translation or
   if a translation is no longer used.
4. Add a test for what you changed when you can. The tests in `tests/` use fake
   models, so they run in seconds and don't need a GPU or API keys.

Keep pull requests small and focused, and explain in plain words what changed
and why.

## A few rules the code follows

- **N-ATLAS is never faked.** If N-ATLAS isn't reachable, the app says so; it
  never quietly uses another model and calls it N-ATLAS.
- **The assistant never invents facts.** It only answers from information the
  owner has approved. Don't loosen that.
- **Every translated line is checked** for numbers, prices and the right
  language before anyone sees it. If you change the translation code, keep
  those checks.
- **No secrets in the repo.** Keys go in `backend/.env`, which git ignores.

## Licence

By contributing you agree that your contribution is released under the
[MIT licence](LICENSE) that covers this project.
