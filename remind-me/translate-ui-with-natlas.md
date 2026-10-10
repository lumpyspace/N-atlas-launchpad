# Translate Launchpad's interface with N-ATLAS

**Status:** postponed (decided 2026-10-10). The interface currently uses translations written by Claude
(`frontend/src/i18n/pid.ts`, `yo.ts`, `ha.ts`, `ig.ts`). The aim is for N-ATLAS itself to translate
them, since that is what the model is built for.

## What's ready

`scripts/translate-ui.mts` sends every interface string to N-ATLAS in batches, checks each translation
(placeholders kept, not empty, not left in English), caches progress in `scripts/.translate-cache/`
(git-ignored, so a run can stop and resume), and rebuilds the dictionaries with `--write`. Strings that
fail a check keep the current text and are listed in the file header for review.

```bash
cd backend
npx tsx ../scripts/translate-ui.mts --lang yo,ha,ig          # translate (resumable)
npx tsx ../scripts/translate-ui.mts --lang yo,ha,ig --write  # rebuild the dictionaries
node --import tsx --test ../tests/i18n.test.ts               # check coverage and placeholders
```

## What the sample showed (8 strings per language, local CPU)

| Language | Result |
|---|---|
| Hausa | Good — natural and correct |
| Igbo | Mostly good, a few nonsense phrases |
| Yoruba | Understandable but **without tone marks** (`idahun to dara` vs `ìdáhùn tó dára`) |
| Pidgin | **Wrong language** — N-ATLAS wrote Igbo/Yoruba. Pidgin isn't one of its official languages |

Speed: about 2.5 minutes per batch of 8 short strings → roughly 3–5 hours per language on a laptop CPU;
minutes on a GPU endpoint (set `NATLAS_BASE_URL`).

## Before running it

- [ ] Add a check that the output is in the right language (use `detectLanguage` from the SDK) — the
      Pidgin sample passed the current checks because it simply wasn't English.
- [ ] Decide on Pidgin: probably keep the current text (N-ATLAS can't write it).
- [ ] Decide whether Yoruba without tone marks is acceptable, or keep the current Yoruba.
- [ ] Run on a GPU if possible, or overnight with the laptop kept awake.
- [ ] Have a native speaker review whichever version ships.
