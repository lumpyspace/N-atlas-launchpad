import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every interface string — t("…") and N_("…") in the frontend — must have a
 * translation in each language dictionary, and every translation must keep
 * the {placeholders} of its English key.
 */

const SRC = new URL("../frontend/src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const LANGS = ["yo", "ha", "ig"] as const;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Literal strings passed to t( / N_( / plural(t, n, …) — including multi-line calls. */
export function extractKeys(): Set<string> {
  const keys = new Set<string>();
  const lit = String.raw`"((?:[^"\\]|\\.)*)"`;
  const patterns = [
    new RegExp(String.raw`\b(?:t|N_)\(\s*` + lit, "g"),
    new RegExp(String.raw`\bplural\(\s*t\s*,[^,]+,\s*` + lit + String.raw`\s*,\s*` + lit, "g"),
  ];
  for (const f of files(SRC)) {
    if (f.includes(`${join("i18n", "")}`) && !f.endsWith("extraKeys.ts")) continue;
    const code = readFileSync(f, "utf8");
    for (const re of patterns) {
      for (const m of code.matchAll(re)) {
        for (const g of m.slice(1)) if (g !== undefined) keys.add(JSON.parse(`"${g}"`));
      }
    }
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("i18n: every interface string is translated into Yoruba, Hausa and Igbo", async () => {
  const keys = extractKeys();
  assert.ok(keys.size > 300, `expected the interface strings, found ${keys.size}`);
  for (const lang of LANGS) {
    const dict: Record<string, string> = (await import(`../frontend/src/i18n/${lang}.ts`)).default;
    const missing = [...keys].filter((k) => !dict[k]);
    assert.deepEqual(missing, [], `${lang}: ${missing.length} untranslated`);
    for (const [k, v] of Object.entries(dict)) {
      assert.deepEqual(placeholders(v), placeholders(k), `${lang}: placeholders differ for ${JSON.stringify(k)}`);
    }
  }
});

test("i18n: dictionaries hold no stale keys", async () => {
  const keys = extractKeys();
  for (const lang of LANGS) {
    const dict: Record<string, string> = (await import(`../frontend/src/i18n/${lang}.ts`)).default;
    const stale = Object.keys(dict).filter((k) => !keys.has(k));
    assert.deepEqual(stale, [], `${lang}: keys no longer used`);
  }
});
