/**
 * Knowledge: split a developer's documents into passages and find the ones
 * relevant to a question (BM25 keyword search), so N-ATLAS answers from them.
 *
 * Keyword search, not embeddings: N-ATLAS has no embedding model, and BM25 with
 * accent-insensitive matching works across English, Pidgin, Yoruba, Hausa and
 * Igbo text without extra downloads. Runs in the browser — instant, offline.
 */

export interface KChunk {
  id: string;
  text: string;
}

export interface KDoc {
  id: string;
  name: string;
  addedAt: string;
  chars: number;
  chunks: KChunk[];
}

export interface KHit {
  doc: KDoc;
  chunk: KChunk;
  /** Position of the chunk in its document (1-based), for citing. */
  index: number;
  score: number;
}

const TARGET_WORDS = 160;
const MAX_WORDS = 240;

/** Split text into passages of roughly TARGET_WORDS, keeping paragraphs together. */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current: string[] = [];
  let count = 0;
  const flush = () => {
    if (current.length) chunks.push(current.join("\n\n"));
    current = [];
    count = 0;
  };

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (words > MAX_WORDS) {
      // Split long paragraphs by sentence.
      flush();
      let buf: string[] = [];
      let n = 0;
      for (const sentence of para.split(/(?<=[.!?])\s+/)) {
        const w = sentence.split(/\s+/).length;
        if (n + w > TARGET_WORDS && buf.length) {
          chunks.push(buf.join(" "));
          buf = [];
          n = 0;
        }
        buf.push(sentence);
        n += w;
      }
      if (buf.length) chunks.push(buf.join(" "));
      continue;
    }
    if (count + words > TARGET_WORDS && current.length) flush();
    current.push(para);
    count += words;
  }
  flush();
  return chunks;
}

export function makeDoc(name: string, text: string): KDoc {
  const stamp = Date.now().toString(36);
  return {
    id: `doc-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    addedAt: new Date().toISOString(),
    chars: text.length,
    chunks: chunkText(text).map((t, i) => ({ id: `${stamp}-${i}`, text: t })),
  };
}

// Common English and Pidgin function words that carry no meaning for search.
const STOPWORDS = new Set(
  "a an the and or but if of to in on at for from by with about as is are was were be been being do does did have has had i you he she it we they me my your our their this that these those what which who whom how when where why can could will would should may might must not no yes so than then there here just also into over under up down out more most some any all each other such only own same very s t don wetin abeg dey na wey una dem e".split(
    " ",
  ),
);

/**
 * Light English suffix stripping so word forms match ("inhibition" and
 * "inhibitors" → "inhibit", "planting" → "plant", "prices" → "price").
 * Keeps at least 4 letters, so short words and most Nigerian-language words
 * are left alone.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  for (const suffix of ["ation", "ion", "ing", "ed", "or", "er", "ly"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) return w.slice(0, -suffix.length);
  }
  return w;
}

/** Lowercase, strip accents (so "kaaro" matches "káàárọ̀"), split into words, stem. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Search all documents' passages with BM25. Returns the best `k` with a positive score. */
export function search(docs: KDoc[], query: string, k = 3): KHit[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const items = docs.flatMap((doc) => doc.chunks.map((chunk, i) => ({ doc, chunk, index: i + 1, terms: tokenize(chunk.text) })));
  if (!items.length) return [];

  const N = items.length;
  const avgLen = items.reduce((s, it) => s + it.terms.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const it of items) for (const t of new Set(it.terms)) df.set(t, (df.get(t) ?? 0) + 1);

  const k1 = 1.4;
  const b = 0.75;
  const scored = items.map((it) => {
    const tf = new Map<string, number>();
    for (const t of it.terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * it.terms.length) / avgLen)));
    }
    return { doc: it.doc, chunk: it.chunk, index: it.index, score };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

/** Passages as the "facts" block sent with a question, each labelled with its source. */
export function formatHits(hits: KHit[]): string {
  return hits.map((h) => `[${h.doc.name} — passage ${h.index}]\n${h.chunk.text}`).join("\n\n");
}

/** Bytes the knowledge base takes in browser storage (UTF-16 ≈ 2 bytes per char). */
export function storageBytes(docs: KDoc[]): number {
  return docs.reduce((s, d) => s + d.chunks.reduce((c, ch) => c + ch.text.length * 2, 0), 0);
}

/** Keep each project's documents well inside the browser's ~5 MB storage limit. */
export const KNOWLEDGE_LIMIT_BYTES = 2_500_000;
