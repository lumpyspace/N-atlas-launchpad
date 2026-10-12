// A small live benchmark of a published-site assistant: the same questions in
// Hausa, Yoruba and Igbo, each answer checked for the right fact, and
// who spoke it (N-ATLAS, or Groq stepping in when N-ATLAS's line failed a check).
// Usage: node scripts/bench.mjs [baseUrl] > docs/evidence/bench.json
const BASE = (process.argv[2] ?? "https://n-atlas-sites.vercel.app").replace(/\/+$/, "");

const config = {
  name: "Kano Grains",
  tagline: "Grain prices at Dawanau market.",
  greeting: "Hello! Ask me about grain prices or place an order.",
  language: "en",
  instructions: "You are Kano Grains, a friendly assistant for a grain shop at Dawanau market in Kano.",
  blocks: {
    info: { on: true, text: "Opening hours: 8am to 6pm, Monday to Saturday.\nAddress: Shop 12, Dawanau market." },
    prices: { on: true, items: [{ name: "Rice", unit: "bag (50 kg)", price: 82000 }, { name: "Beans", unit: "bag (100 kg)", price: 95000 }, { name: "Maize", unit: "bag (100 kg)", price: null }] },
    orders: { on: true, kind: "order", fields: ["name", "phone number", "item", "quantity"] },
    contact: { on: true, whatsapp: "+2348012345678", phone: "", hours: "8am–6pm" },
  },
};

// [what's asked, the fact a right answer contains]
const checks = {
  rice: /82,?000/,
  beans: /95,?000/,
  hours: /\b8\b[\s\S]*\b6\b|8\s*(?:am|na safe)|6\s*(?:pm|na yamma)/i,
  where: /Dawanau/i, // the market's name must survive translation
  maize: /^(?![\s\S]*₦\s?\d)/, // no invented price
};
const questions = {
  ha: { rice: "Nawa ne buhun shinkafa?", beans: "Nawa ne buhun wake?", hours: "Yaushe kuke buɗe shago?", where: "Ina shagonku yake?", maize: "Nawa ne buhun masara?" },
  yo: { rice: "Elo ni àpò ìrẹsì?", beans: "Elo ni àpò ẹ̀wà?", hours: "Ìgbà wo ni ẹ máa ń ṣí ṣọ́ọ̀bù?", where: "Níbo ni ṣọ́ọ̀bù yín wà?", maize: "Elo ni àpò àgbàdo?" },
  ig: { rice: "Ego ole ka akpa osikapa bụ?", beans: "Ego ole ka akpa agwa bụ?", hours: "Kedu oge unu na-emeghe ụlọ ahịa?", where: "Ebee ka ụlọ ahịa unu dị?", maize: "Ego ole ka akpa ọka bụ?" },
};

const rows = [];
for (const [lang, qs] of Object.entries(questions)) {
  for (const [topic, q] of Object.entries(qs)) {
    const started = Date.now();
    let r;
    try {
      const res = await fetch(`${BASE}/api/sites/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, history: [{ role: "user", content: q }], lang }),
        signal: AbortSignal.timeout(120_000),
      });
      r = { status: res.status, ...(await res.json()) };
    } catch (err) {
      r = { status: 0, error: String(err) };
    }
    const ms = Date.now() - started;
    // Judged on what the visitor read, not the English behind it.
    const correct = r.status === 200 && checks[topic].test(r.reply ?? "");
    rows.push({ lang, topic, question: q, reply: r.reply, english: r.english, replyLanguage: r.language, voice: r.voice, status: r.status, ms, correct });
    console.error(`${lang} ${topic.padEnd(5)} ${r.status} ${(ms / 1000).toFixed(1)}s ${correct ? "✓" : "✗"} ${r.voice ?? r.error ?? ""}`);
    await new Promise((s) => setTimeout(s, 2500));
  }
}

const ok = rows.filter((r) => r.status === 200);
const sorted = ok.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  answers: rows.length,
  succeeded: ok.length,
  correct: rows.filter((r) => r.correct).length,
  inTheirLanguage: ok.filter((r) => r.replyLanguage === r.lang).length,
  spokenByNatlas: ok.filter((r) => r.voice === "N-ATLAS").length,
  spokenByGroq: ok.filter((r) => r.voice === "Groq").length,
  medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
  p90Ms: sorted[Math.floor(sorted.length * 0.9)] ?? null,
};
console.error(JSON.stringify(summary));
console.log(JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), summary, rows }, null, 2));
