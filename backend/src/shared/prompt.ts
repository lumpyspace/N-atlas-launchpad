/**
 * Shared system-prompt utilities used by the blueprint generator, the security
 * engine, the harden step, and the scripted demo provider — so they all agree
 * on how the canary and the hardening marker look.
 *
 * The CANARY is a secret token planted in every generated system prompt. If a
 * model's response ever echoes it, that is deterministic proof of system-prompt
 * leakage — no LLM judge required.
 */

export const CANARY_PREFIX = "ATLAS-SENTINEL-";
const CANARY_RE = /ATLAS-SENTINEL-[A-Z0-9]{4,}/;

/** Deterministic per-seed (FNV-1a) so demos and tests are reproducible. */
export function makeCanary(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const code = (h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `${CANARY_PREFIX}${code}`;
}

/** Pull the canary token out of a system prompt (whatever its value). */
export function extractCanary(systemPrompt: string): string | null {
  const m = systemPrompt.match(CANARY_RE);
  return m ? m[0] : null;
}

/**
 * Marker that the harden step injects. Its presence means "this prompt has the
 * strong instruction-hierarchy + no-leak defences applied." The scripted demo
 * provider keys its before/after behaviour off this; the security engine does
 * not depend on it (it checks real responses).
 */
export const HARDENING_MARKER = "SECURITY DIRECTIVES (highest priority)";

export function isHardened(systemPrompt: string): boolean {
  return systemPrompt.includes(HARDENING_MARKER);
}
