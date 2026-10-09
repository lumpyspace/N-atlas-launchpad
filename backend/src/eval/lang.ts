/**
 * Heuristic language identification for Nigerian English, Pidgin, Yoruba,
 * Hausa and Igbo, plus repetition-loop detection.
 *
 * Pure regex/counting — no model calls — so checks stay deterministic and
 * cheap. Results are hints, not ground truth: short or code-switched replies
 * can be mislabelled, so callers should report the evidence alongside the
 * verdict.
 */

export type LangCode = "en" | "pid" | "yo" | "ha" | "ig";

export const LANG_NAMES: Record<LangCode, string> = {
  en: "English",
  pid: "Nigerian Pidgin",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
};

// Distinctive letters (strong evidence, counted per occurrence, capped)
const CHARS: Partial<Record<LangCode, RegExp>> = {
  yo: /[ẹọṣ]|[àáèéìíòóùú]/giu,
  ha: /[ɓɗƙƴ]/giu,
  ig: /[ịụṅ]/giu,
};

// Function words that are common in one language and rare in the others.
// Deliberately excludes short words shared across languages ("na", "ya", "da").
// `\b` is ASCII-only, so words are bounded by "not a letter" lookarounds to
// handle accented letters like ẹ/ọ/ị.
const words = (list: string) => new RegExp(`(?<!\\p{L})(?:${list})(?!\\p{L})`, "giu");
const WORDS: Record<LangCode, RegExp> = {
  en: words("the|and|is|are|you|your|with|this|that|for|can|will|should|have|it|of|to|in"),
  pid: words("wetin|abeg|dey|una|wahala|sabi|comot|oga|dem|naim|fit|wan|go\\s+dey|no\\s+be|how\\s+far|small\\s+small|make\\s+you"),
  yo: words("mo|emi|ẹ|ti|naa|fun|wọn|àwọn|kò|àti|tó|yìí|ni|lati|láti|jẹ|ṣe|pẹlu|ìgbà|wa"),
  ha: words("shi|ita|mu|su|amma|don|kuma|daga|wani|kamar|yana|tana|suna|akwai|zai|ne|ce|wannan|sosai"),
  ig: words("nke|ndi|bụ|dị|ihe|ebe|gị|unu|anyị|maka|kwa|nwere|ga-"),
};

export interface LangGuess {
  lang: LangCode;
  /** 0..1 share of the total evidence held by the winner. */
  confidence: number;
  scores: Record<LangCode, number>;
}

export function detectLanguage(text: string): LangGuess {
  const scores: Record<LangCode, number> = { en: 0, pid: 0, yo: 0, ha: 0, ig: 0 };
  for (const [code, re] of Object.entries(WORDS) as [LangCode, RegExp][]) {
    scores[code] += (text.match(re) ?? []).length;
  }
  // Pidgin is mostly English words, so its markers count double.
  scores.pid *= 2;
  for (const [code, re] of Object.entries(CHARS) as [LangCode, RegExp][]) {
    scores[code] += Math.min(10, (text.match(re) ?? []).length) * 0.5;
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const [lang, best] = (Object.entries(scores) as [LangCode, number][]).reduce((a, b) =>
    b[1] > a[1] ? b : a,
  );
  return { lang: total ? lang : "en", confidence: total ? best / total : 0, scores };
}

/**
 * Find the most-repeated word n-gram. Catches degenerate loops such as
 * "kaifi ne, kaifi ne, kaifi ne…" that a length check would happily pass.
 */
export function findRepetition(text: string, n = 3): { phrase: string; count: number } {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const counts = new Map<string, number>();
  let best = { phrase: "", count: 0 };
  // Small n so short looping phrases are caught; n-grams overlap.
  for (let size = 2; size <= n; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const gram = words.slice(i, i + size).join(" ");
      const c = (counts.get(gram) ?? 0) + 1;
      counts.set(gram, c);
      if (c > best.count || (c === best.count && gram.length > best.phrase.length)) {
        best = { phrase: gram, count: c };
      }
    }
  }
  return best;
}
