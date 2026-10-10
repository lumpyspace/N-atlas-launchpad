/**
 * Knowledge: chunking and BM25 search over the developer's documents.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, formatHits, makeDoc, search, tokenize } from "../frontend/src/utils/knowledge.ts";

const NOTES = `BCH 201 — Week 3: Enzymes

Enzymes are biological catalysts, mostly proteins. They speed up reactions and are not used up.

The substrate binds at the active site. Competitive inhibitors bind the active site; non-competitive inhibitors bind elsewhere.

Week 4: Metabolism

Glycolysis breaks glucose into pyruvate and produces ATP. It happens in the cytoplasm.`;

const PRICES = `Mile 12 market prices (Tuesday)

Tomatoes, big basket: ₦45,000
Rice, local, 50kg bag: ₦78,000`;

test("short documents stay whole; long ones split into passages", () => {
  assert.equal(chunkText(NOTES).length, 1);
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} about cassava farming in Ogun state and planting dates.`).join("\n\n");
  const chunks = chunkText(long);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.split(/\s+/).length <= 250);
});

test("search finds the relevant passage across documents", () => {
  const docs = [makeDoc("Biochemistry notes", NOTES), makeDoc("Price list", PRICES)];
  const hits = search(docs, "What did my notes say about competitive inhibition?");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].doc.name, "Biochemistry notes");
  const price = search(docs, "how much is rice for Mile 12?");
  assert.equal(price[0].doc.name, "Price list");
  assert.match(formatHits(price.slice(0, 1)), /^\[Price list — passage 1\]/);
});

test("matching ignores accents and case, and skips filler words", () => {
  assert.deepEqual(tokenize("Ẹ KÁÀÁRỌ̀, the market!"), ["kaaaro", "market"], "single letters and filler words are skipped");
  const docs = [makeDoc("Yoruba", "Ẹ káàárọ̀ means good morning. Use it with elders.")];
  assert.equal(search(docs, "what does e kaaaro mean").length, 1);
  assert.deepEqual(search(docs, "the and of"), [], "a query of only filler words finds nothing");
});

test("word forms match: inhibition ~ inhibitors, planting ~ planted, prices ~ price", async () => {
  const { stem } = await import("../frontend/src/utils/knowledge.ts");
  assert.equal(stem("inhibition"), stem("inhibitors"));
  assert.equal(stem("planting"), stem("planted"));
  assert.equal(stem("prices"), "price");
  assert.equal(stem("order"), "order", "keeps short stems intact");
  const docs = [makeDoc("Notes", "Competitive inhibitors bind the active site.")];
  assert.equal(search(docs, "explain inhibition").length, 1);
});
