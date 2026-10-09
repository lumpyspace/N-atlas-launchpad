/**
 * The test kit added to an exported project: the developer's own test cases
 * (with checks), scoring runners for JS and Python that exit non-zero on a
 * failure (so they work in CI), a GitHub Actions workflow, and fine-tuning
 * data built from 👍/👎 verdicts.
 *
 * The check logic mirrors backend/src/eval/checks.ts + lang.ts so a test
 * passes or fails the same way here as on the Launchpad website.
 *
 * Code blocks are String.raw so regex backslashes survive; they avoid `${}`.
 */

import type { SavedTestCase } from "../state/ProjectContext";
import { toSuiteFile } from "../utils/testCases";

export function testKitFiles(
  appName: string,
  systemPrompt: string,
  cases: SavedTestCase[],
  lang: "js" | "python",
): Record<string, string> {
  const suite = JSON.stringify(toSuiteFile(appName, cases, systemPrompt), null, 2) + "\n";
  const files: Record<string, string> = {
    "tests/my-tests.json": suite,
    ".github/workflows/natlas-tests.yml": workflow(lang),
    ...fineTuneFiles(systemPrompt, cases),
  };
  if (lang === "js") {
    files["tests/checks.js"] = JS_CHECKS;
    files["tests/run-tests.js"] = JS_RUNNER;
  } else {
    files["tests/checks.py"] = PY_CHECKS;
    files["tests/run_tests.py"] = PY_RUNNER;
  }
  return files;
}

// ── Fine-tuning data ─────────────────────────────────────────────────────────

function fineTuneFiles(systemPrompt: string, cases: SavedTestCase[]): Record<string, string> {
  const msg = (user: string, assistant: string) =>
    JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user },
        { role: "assistant", content: assistant },
      ],
    });
  const good = cases.filter((c) => c.verdict === "good" && c.userMessage && c.assistantReply);
  const bad = cases.filter((c) => c.verdict === "bad" && c.userMessage);
  return {
    "finetune/good-examples.jsonl": good.map((c) => msg(c.userMessage, c.assistantReply)).join("\n") + (good.length ? "\n" : ""),
    "finetune/to-fix.jsonl":
      bad
        .map((c) =>
          JSON.stringify({
            user: c.userMessage,
            language: c.language,
            bad_reply: c.assistantReply,
            problem: c.note,
            expected: c.expectedBehavior,
            ideal_reply: "",
          }),
        )
        .join("\n") + (bad.length ? "\n" : ""),
    "finetune/README.md": `# Fine-tuning data

Built from the replies you marked in the Launchpad Playground.

- \`good-examples.jsonl\` — ${good.length} 👍 replies in OpenAI/HF chat format
  (\`{"messages": [system, user, assistant]}\`). Ready for supervised fine-tuning
  (e.g. TRL \`SFTTrainer\`, Axolotl, or Unsloth on N-ATLAS / Llama-3 8B).
- \`to-fix.jsonl\` — ${bad.length} 👎 replies with what went wrong. Write the reply
  you wanted in \`ideal_reply\`, then convert each line to the chat format above
  and add it to your training set.

Tips: aim for a few hundred high-quality, varied examples per language before
training; keep a held-out set (e.g. \`tests/my-tests.json\`) to check the
fine-tuned model didn't regress.
`,
  };
}

// ── CI ───────────────────────────────────────────────────────────────────────

function workflow(lang: "js" | "python"): string {
  const steps =
    lang === "js"
      ? `      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node tests/run-tests.js`
      : `      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: python tests/run_tests.py`;
  return `# Runs your N-ATLAS test cases on every push and pull request.
# Add repository secrets NATLAS_BASE_URL (and NATLAS_API_KEY if your endpoint
# needs one). The job is skipped when NATLAS_BASE_URL is not set.
name: N-ATLAS tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      NATLAS_BASE_URL: \${{ secrets.NATLAS_BASE_URL }}
      NATLAS_API_KEY: \${{ secrets.NATLAS_API_KEY }}
      NATLAS_MODEL: n-atlas
    steps:
      - uses: actions/checkout@v4
      - name: Skip when no N-ATLAS endpoint is configured
        if: env.NATLAS_BASE_URL == ''
        run: echo "Set the NATLAS_BASE_URL secret to run these tests." && exit 0
${steps}
        if: env.NATLAS_BASE_URL != ''
`;
}

// ── JavaScript ───────────────────────────────────────────────────────────────

const JS_CHECKS = String.raw`// Check logic for tests/my-tests.json — mirrors N-ATLAS Launchpad's scorer.

/** Lowercase and strip accents so "kaaro" matches "Ẹ Káàárọ̀". */
export function normalize(text) {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const REFUSAL = [
  /\bi (?:cannot|can't|can not|won't|will not|am (?:not able|unable))\b/i,
  /\b(?:i'm|i am) (?:sorry|unable|not able)\b/i,
  /\b(?:cannot|can't|unable to) (?:help|assist|comply|provide|do that)\b/i,
  /\bi must (?:decline|refuse)\b/i,
];

const words = (list) => new RegExp("(?<!\\p{L})(?:" + list + ")(?!\\p{L})", "giu");
const WORDS = {
  en: words("the|and|is|are|you|your|with|this|that|for|can|will|should|have|it|of|to|in"),
  pid: words("wetin|abeg|dey|una|wahala|sabi|comot|oga|dem|naim|fit|wan|go\\s+dey|no\\s+be|how\\s+far|small\\s+small|make\\s+you"),
  yo: words("mo|emi|ẹ|ti|naa|fun|wọn|àwọn|kò|àti|tó|yìí|ni|lati|láti|jẹ|ṣe|pẹlu|ìgbà|wa"),
  ha: words("shi|ita|mu|su|amma|don|kuma|daga|wani|kamar|yana|tana|suna|akwai|zai|ne|ce|wannan|sosai"),
  ig: words("nke|ndi|bụ|dị|ihe|ebe|gị|unu|anyị|maka|kwa|nwere|ga-"),
};
const CHARS = { yo: /[ẹọṣ]|[àáèéìíòóùú]/giu, ha: /[ɓɗƙƴ]/giu, ig: /[ịụṅ]/giu };

export function detectLanguage(text) {
  const scores = { en: 0, pid: 0, yo: 0, ha: 0, ig: 0 };
  for (const [k, re] of Object.entries(WORDS)) scores[k] += (text.match(re) || []).length;
  scores.pid *= 2;
  for (const [k, re] of Object.entries(CHARS)) scores[k] += Math.min(10, (text.match(re) || []).length) * 0.5;
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const [lang, best] = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a));
  return { lang: total ? lang : "en", confidence: total ? best / total : 0, scores };
}

function maxRepeat(text) {
  const w = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  const counts = new Map();
  let best = { phrase: "", count: 0 };
  for (let n = 2; n <= 3; n++)
    for (let i = 0; i + n <= w.length; i++) {
      const g = w.slice(i, i + n).join(" ");
      const c = (counts.get(g) || 0) + 1;
      counts.set(g, c);
      if (c > best.count) best = { phrase: g, count: c };
    }
  return best;
}

/** Returns { passed, detail } for one check. */
export function runCheck(check, output, latencyMs) {
  const norm = normalize(output);
  switch (check.type) {
    case "containsAny": {
      const hit = check.values.find((v) => norm.includes(normalize(v)));
      return { passed: !!hit, detail: hit ? "matched " + JSON.stringify(hit) : "none found" };
    }
    case "containsAll": {
      const missing = check.values.filter((v) => !norm.includes(normalize(v)));
      return { passed: !missing.length, detail: missing.length ? "missing: " + missing.join(", ") : "all present" };
    }
    case "notContains": {
      const found = check.values.filter((v) => norm.includes(normalize(v)));
      return { passed: !found.length, detail: found.length ? "found: " + found.join(", ") : "none present" };
    }
    case "regex":
      return { passed: new RegExp(check.pattern, check.flags).test(output), detail: "/" + check.pattern + "/" };
    case "minLength":
      return { passed: output.trim().length >= check.chars, detail: output.trim().length + " chars" };
    case "refusal": {
      const refused = REFUSAL.some((re) => re.test(output));
      return { passed: refused === check.expected, detail: "refused=" + refused };
    }
    case "language": {
      const g = detectLanguage(output);
      let passed;
      if (check.lang === "pid") passed = g.lang === "pid" || (g.lang === "en" && g.scores.pid >= 2);
      else if (check.lang === "en") passed = !["yo", "ha", "ig"].includes(g.lang) || g.confidence < 0.4;
      else passed = g.lang === check.lang;
      return { passed, detail: "detected " + g.lang };
    }
    case "noRepetition": {
      const r = maxRepeat(output);
      const max = check.maxRepeats ?? 4;
      return { passed: r.count <= max, detail: JSON.stringify(r.phrase) + " x" + r.count };
    }
    case "maxLatency":
      return { passed: latencyMs <= check.ms, detail: (latencyMs / 1000).toFixed(1) + "s" };
    case "jsonShape": {
      let value;
      try {
        value = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
      } catch {
        return { passed: false, detail: "no valid JSON object" };
      }
      const errors = Object.entries(check.schema)
        .filter(([k, type]) => {
          const v = value?.[k];
          return (Array.isArray(v) ? "array" : v === null ? "null" : typeof v) !== type;
        })
        .map(([k, type]) => k + " should be " + type);
      return { passed: !errors.length, detail: errors.join("; ") || "JSON matches" };
    }
    default:
      return { passed: true, detail: "unknown check type " + check.type + " (skipped)" };
  }
}
`;

const JS_RUNNER = String.raw`// Runs tests/my-tests.json against your N-ATLAS endpoint and scores each reply.
// Exits with code 1 if any test fails, so it can gate CI.
//   node tests/run-tests.js            run all tests
//   node tests/run-tests.js armyworm   run tests whose id or prompt matches
import { readFile } from "node:fs/promises";
import { generate } from "../src/natlas.js";
import { SYSTEM_PROMPT } from "../src/systemPrompt.js";
import { runCheck } from "./checks.js";

const LANGUAGE = { en: "Nigerian-accented English", pid: "Nigerian Pidgin", yo: "Yoruba", ha: "Hausa", ig: "Igbo" };
const suite = JSON.parse(await readFile(new URL("./my-tests.json", import.meta.url), "utf8"));
const filter = (process.argv[2] || "").toLowerCase();
const tests = suite.tests.filter((t) => !filter || (t.id + " " + t.prompt).toLowerCase().includes(filter));

let failed = 0;
for (const t of tests) {
  // Same facts + language wording the app uses, so tests replay faithfully.
  let system = SYSTEM_PROMPT;
  if (t.context) system += "\n\nAnswer only from these facts. If they don't cover the question, say so:\n" + t.context;
  if (LANGUAGE[t.language]) system += " Respond in " + LANGUAGE[t.language] + ".";
  const started = Date.now();
  let output = "";
  try {
    output = await generate(t.prompt, { system, maxTokens: 200 });
  } catch (e) {
    failed++;
    console.log("✗ ERROR " + t.id + ": " + e.message);
    continue;
  }
  const latency = Date.now() - started;
  const results = t.checks.map((c) => ({ type: c.type, ...runCheck(c, output, latency) }));
  const ok = results.every((r) => r.passed);
  if (!ok) failed++;
  console.log((ok ? "✓ PASS " : "✗ FAIL ") + t.id + "  (" + (latency / 1000).toFixed(1) + "s)  " + t.prompt.slice(0, 70));
  for (const r of results) if (!r.passed) console.log("     ✗ " + r.type + ": " + r.detail);
  if (!ok) console.log("     reply: " + output.slice(0, 200).replace(/\s+/g, " "));
}
console.log("\n" + (tests.length - failed) + "/" + tests.length + " passed");
process.exit(failed ? 1 : 0);
`;

// ── Python ───────────────────────────────────────────────────────────────────

const PY_CHECKS = String.raw`"""Check logic for tests/my-tests.json — mirrors N-ATLAS Launchpad's scorer."""
import json
import re
import unicodedata

REFUSAL = [
    re.compile(r"\bi (?:cannot|can't|can not|won't|will not|am (?:not able|unable))\b", re.I),
    re.compile(r"\b(?:i'm|i am) (?:sorry|unable|not able)\b", re.I),
    re.compile(r"\b(?:cannot|can't|unable to) (?:help|assist|comply|provide|do that)\b", re.I),
    re.compile(r"\bi must (?:decline|refuse)\b", re.I),
]


def _words(alts):
    return re.compile(r"(?<![^\W\d_])(?:" + alts + r")(?![^\W\d_])", re.I)


WORDS = {
    "en": _words("the|and|is|are|you|your|with|this|that|for|can|will|should|have|it|of|to|in"),
    "pid": _words(r"wetin|abeg|dey|una|wahala|sabi|comot|oga|dem|naim|fit|wan|go\s+dey|no\s+be|how\s+far|small\s+small|make\s+you"),
    "yo": _words("mo|emi|ẹ|ti|naa|fun|wọn|àwọn|kò|àti|tó|yìí|ni|lati|láti|jẹ|ṣe|pẹlu|ìgbà|wa"),
    "ha": _words("shi|ita|mu|su|amma|don|kuma|daga|wani|kamar|yana|tana|suna|akwai|zai|ne|ce|wannan|sosai"),
    "ig": _words("nke|ndi|bụ|dị|ihe|ebe|gị|unu|anyị|maka|kwa|nwere|ga-"),
}
CHARS = {"yo": re.compile("[ẹọṣàáèéìíòóùú]", re.I), "ha": re.compile("[ɓɗƙƴ]", re.I), "ig": re.compile("[ịụṅ]", re.I)}


def normalize(text):
    """Lowercase and strip accents so 'kaaro' matches 'Ẹ Káàárọ̀'."""
    t = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.lower()).strip()


def detect_language(text):
    scores = {k: len(r.findall(text)) for k, r in WORDS.items()}
    scores["pid"] *= 2
    for k, r in CHARS.items():
        scores[k] += min(10, len(r.findall(text))) * 0.5
    total = sum(scores.values())
    lang = max(scores, key=scores.get) if total else "en"
    return lang, (scores[lang] / total if total else 0), scores


def _max_repeat(text):
    w = re.findall(r"[\w']+", text.lower())
    counts, best = {}, ("", 0)
    for n in (2, 3):
        for i in range(len(w) - n + 1):
            g = " ".join(w[i:i + n])
            counts[g] = counts.get(g, 0) + 1
            if counts[g] > best[1]:
                best = (g, counts[g])
    return best


def run_check(check, output, latency_ms):
    """Return (passed, detail) for one check."""
    norm, t = normalize(output), check["type"]
    if t == "containsAny":
        hit = next((v for v in check["values"] if normalize(v) in norm), None)
        return hit is not None, f"matched {hit!r}" if hit else "none found"
    if t == "containsAll":
        missing = [v for v in check["values"] if normalize(v) not in norm]
        return not missing, "missing: " + ", ".join(missing) if missing else "all present"
    if t == "notContains":
        found = [v for v in check["values"] if normalize(v) in norm]
        return not found, "found: " + ", ".join(found) if found else "none present"
    if t == "regex":
        flags = re.I if "i" in check.get("flags", "") else 0
        return re.search(check["pattern"], output, flags) is not None, "/" + check["pattern"] + "/"
    if t == "minLength":
        return len(output.strip()) >= check["chars"], f"{len(output.strip())} chars"
    if t == "refusal":
        refused = any(r.search(output) for r in REFUSAL)
        return refused == check["expected"], f"refused={refused}"
    if t == "language":
        lang, conf, scores = detect_language(output)
        want = check["lang"]
        if want == "pid":
            ok = lang == "pid" or (lang == "en" and scores["pid"] >= 2)
        elif want == "en":
            ok = lang not in ("yo", "ha", "ig") or conf < 0.4
        else:
            ok = lang == want
        return ok, f"detected {lang}"
    if t == "noRepetition":
        phrase, count = _max_repeat(output)
        return count <= check.get("maxRepeats", 4), f"{phrase!r} x{count}"
    if t == "maxLatency":
        return latency_ms <= check["ms"], f"{latency_ms / 1000:.1f}s"
    if t == "jsonShape":
        try:
            value = json.loads(output[output.index("{"):output.rindex("}") + 1])
        except ValueError:
            return False, "no valid JSON object"
        names = {"string": str, "number": (int, float), "boolean": bool, "array": list, "object": dict}
        errors = [
            f"{k} should be {kind}" for k, kind in check["schema"].items()
            if k not in value or not isinstance(value[k], names[kind])
            or (kind == "number" and isinstance(value[k], bool))
        ]
        return not errors, "; ".join(errors) or "JSON matches"
    return True, f"unknown check type {t} (skipped)"
`;

const PY_RUNNER = String.raw`"""Run tests/my-tests.json against your N-ATLAS endpoint and score each reply.

Exits with code 1 if any test fails, so it can gate CI.
    python tests/run_tests.py            run all tests
    python tests/run_tests.py armyworm   run tests whose id or prompt matches
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from natlas import generate  # noqa: E402
from system_prompt import SYSTEM_PROMPT  # noqa: E402
from checks import run_check  # noqa: E402

LANGUAGE = {"en": "Nigerian-accented English", "pid": "Nigerian Pidgin", "yo": "Yoruba", "ha": "Hausa", "ig": "Igbo"}

here = os.path.dirname(__file__)
with open(os.path.join(here, "my-tests.json"), encoding="utf-8") as f:
    suite = json.load(f)
needle = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
tests = [t for t in suite["tests"] if not needle or needle in (t["id"] + " " + t["prompt"]).lower()]

failed = 0
for t in tests:
    # Same facts + language wording the app uses, so tests replay faithfully.
    system = SYSTEM_PROMPT
    if t.get("context"):
        system += "\n\nAnswer only from these facts. If they don't cover the question, say so:\n" + t["context"]
    if t.get("language") in LANGUAGE:
        system += f" Respond in {LANGUAGE[t['language']]}."
    started = time.time()
    try:
        output = generate(t["prompt"], system=system, max_tokens=200)
    except Exception as e:  # noqa: BLE001
        failed += 1
        print(f"✗ ERROR {t['id']}: {e}")
        continue
    latency = (time.time() - started) * 1000
    results = [(c["type"], *run_check(c, output, latency)) for c in t["checks"]]
    ok = all(passed for _, passed, _ in results)
    failed += 0 if ok else 1
    print(f"{'✓ PASS' if ok else '✗ FAIL'} {t['id']}  ({latency / 1000:.1f}s)  {t['prompt'][:70]}")
    for kind, passed, detail in results:
        if not passed:
            print(f"     ✗ {kind}: {detail}")
    if not ok:
        print("     reply: " + " ".join(output[:200].split()))

print(f"\n{len(tests) - failed}/{len(tests)} passed")
sys.exit(1 if failed else 0)
`;
