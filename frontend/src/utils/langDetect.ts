/**
 * Heuristic language detection for Nigerian languages.
 *
 * Uses character-level markers (unique Unicode letters) and common function
 * words to identify Yoruba, Hausa, Igbo and Nigerian Pidgin. English is the
 * fallback. All checks are pure regex — no model calls.
 *
 * Limitations: short texts (<10 words) are unreliable. Mixed-language replies
 * may be mis-labelled. Treat results as hints, not ground truth.
 */

export type DetectedLang = "en" | "yo" | "ha" | "ig" | "pid" | "unknown";

// Yoruba: tone-diacritic vowels (ẹ/ọ/ṣ) plus acute/grave on core vowels
const YORUBA_CHARS = /[ẹọṣẹ̀ẹ́ọ̀ọ́àáèéìíòóùú]/u;
// Common Yoruba function words that rarely appear in English
const YORUBA_WORDS = /\b(mo|emi|ti|naa|fun|si|lo|wa|sọ|wọn|àwọn|ọ̀nà|ilé|ọjọ́|kò|àti|tó|yìí)\b/iu;

// Hausa: letters unique to the Hausa alphabet
const HAUSA_CHARS = /[ɓɗƙ]/u;
const HAUSA_WORDS = /\b(ya|ba|ne|ce|da|na|shi|ta|mu|su|mai|amma|don|kuma|game|daga|wani|kamar)\b/iu;

// Igbo: dotted vowels
const IGBO_CHARS = /[ịọụ]/u;
const IGBO_WORDS = /\b(na|ya|nke|chi|ọ|gị|ha|ndi|otu|bụ|dị|ọhụụ|ebe|ihe)\b/iu;

// Nigerian Pidgin: highly distinctive lexical markers
const PIDGIN_WORDS = /\b(wetin|abeg|dey|oga|wahala|sabi|una|comot|waka|chop|naim|e\s+don|no\s+be|how\s+far|na\s+im|dem)\b/i;

/** Score-based detection: returns the language with the most evidence. */
export function detectLang(text: string): DetectedLang {
  if (!text.trim()) return "unknown";

  const scores: Record<DetectedLang, number> = {
    yo: 0, ha: 0, ig: 0, pid: 0, en: 0, unknown: 0,
  };

  // Character-level markers are strong signals
  if (YORUBA_CHARS.test(text)) scores.yo += 3;
  if (HAUSA_CHARS.test(text)) scores.ha += 3;
  if (IGBO_CHARS.test(text)) scores.ig += 3;

  // Word-level counts
  scores.yo += (text.match(new RegExp(YORUBA_WORDS.source, "giu")) ?? []).length;
  scores.ha += (text.match(new RegExp(HAUSA_WORDS.source, "giu")) ?? []).length;
  scores.ig += (text.match(new RegExp(IGBO_WORDS.source, "giu")) ?? []).length;
  scores.pid += (text.match(new RegExp(PIDGIN_WORDS.source, "gi")) ?? []).length * 2;

  const best = (Object.entries(scores) as [DetectedLang, number][]).reduce(
    (a, b) => (b[1] > a[1] ? b : a),
  );

  return best[1] >= 2 ? best[0] : "en";
}

/** Returns true if the text contains Yoruba tone-diacritic vowels. */
export function hasYorubaToneMarks(text: string): boolean {
  return YORUBA_CHARS.test(text);
}

/**
 * Check if the assistant's reply language matches what was requested.
 * Returns a human-readable warning string, or null if no mismatch.
 */
export function checkLangMismatch(
  requestedCode: string,
  replyText: string,
): string | null {
  if (!replyText.trim() || replyText.length < 30) return null;

  const LANG_LABELS: Record<string, string> = {
    yo: "Yoruba",
    ha: "Hausa",
    ig: "Igbo",
    pid: "Nigerian Pidgin",
  };

  const expected = LANG_LABELS[requestedCode];
  if (!expected) return null; // English — no mismatch to flag

  const detected = detectLang(replyText);

  if (detected === "en" && requestedCode !== "en") {
    return `Requested ${expected} but reply looks like English — model may have defaulted to English`;
  }
  if (requestedCode === "yo" && !hasYorubaToneMarks(replyText)) {
    return "Yoruba reply has few or no tone marks — may be romanised or incorrect Yoruba";
  }
  return null;
}
