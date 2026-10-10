/**
 * Launchpad in five languages. The English text is the key: wrap any UI
 * string in t("…") and add its translation to each dictionary in this folder.
 * Missing translations fall back to English, and tests/i18n.test.ts lists any
 * that are missing.
 *
 *   const t = useT();
 *   t("Documents")                      → "Àwọn ìwé" (Yoruba)
 *   t("{n} passages", { n: 3 })         → placeholders are filled after translating
 *
 * The translations were written by an AI and should be checked by native
 * speakers — each language is one file, easy to review and correct.
 */

import { useWorkspace } from "../state/ProjectContext";
import ha from "./ha";
import ig from "./ig";
import pid from "./pid";
import yo from "./yo";

export type LangCode = "en" | "pid" | "yo" | "ha" | "ig";

export interface LanguageInfo {
  code: LangCode;
  /** Name in English. */
  english: string;
  /** Name in the language itself. */
  native: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", english: "English", native: "English" },
  { code: "pid", english: "Nigerian Pidgin", native: "Naijá" },
  { code: "yo", english: "Yoruba", native: "Yorùbá" },
  { code: "ha", english: "Hausa", native: "Hausa" },
  { code: "ig", english: "Igbo", native: "Igbo" },
];

export const DICTIONARIES: Record<Exclude<LangCode, "en">, Record<string, string>> = { pid, yo, ha, ig };

export function isLangCode(v: unknown): v is LangCode {
  return v === "en" || v === "pid" || v === "yo" || v === "ha" || v === "ig";
}

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

export function translate(lang: LangCode, text: string, vars?: Vars): string {
  const out = (lang === "en" ? undefined : DICTIONARIES[lang][text]) ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Translator for the language pages are shown in (the open project's). */
export function useT(): T {
  const { language } = useWorkspace();
  return (text, vars) => translate(language, text, vars);
}

/** Marks a string for translation where it's defined (e.g. in a constant list); translate it with t() where it's shown. */
export const N_ = (text: string): string => text;

/** "1 passage" / "3 passages" — each form is its own key. */
export function plural(t: T, n: number, one: string, other: string): string {
  return n === 1 ? t(one, { n }) : t(other, { n });
}
