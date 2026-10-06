# Tests

Phase 1 covers the **provider contract** and the **mock safety guarantees** —
proving that mock output is always flagged and can never masquerade as real
N-ATLAS.

Run them (they share the backend's `tsx`, so no extra install):

```bash
cd backend
npm install
npm test
```

## Coming later (not yet implemented)
- Nigerian-context evaluation test cases (Yoruba/Hausa/Igbo/NG-English).
- Security & reliability suites (prompt-injection resistance, refusal checks,
  PII handling, consistency/repeatability).
- Scoring + pass/fail + before/after comparison.

These will run against the real `HttpNAtlasProvider` and will be skipped unless a
real N-ATLAS endpoint is configured.
