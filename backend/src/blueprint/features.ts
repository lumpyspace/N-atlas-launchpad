/**
 * Per-feature build advice and channel starter code.
 *
 * Each primary task in the blueprint gets the technique that will actually
 * make it work with an 8B text model — some things N-ATLAS can do from the
 * prompt alone, others need your data, code, a scheduler or another model.
 */

import type { DataSource } from "./useCases.js";

export type Approach = "prompt" | "retrieval" | "lookup" | "compute" | "schedule" | "vision" | "speech";

export interface FeaturePlan {
  task: string;
  approach: Approach;
  approachLabel: string;
  how: string;
}

const APPROACH_LABEL: Record<Approach, string> = {
  prompt: "Prompt only",
  retrieval: "Prompt + your documents",
  lookup: "Backend lookup + N-ATLAS",
  compute: "Code calculates, N-ATLAS explains",
  schedule: "Scheduler + channel message",
  vision: "Needs an image model",
  speech: "N-ATLAS speech recognition",
};

export function planFeature(
  task: string,
  sources: DataSource[],
  channelId: string,
  preset?: { approach: Approach; how?: string; uses?: string[] },
): FeaturePlan {
  const approach = preset?.approach ?? classify(task, sources);
  // Name only the sources this feature actually draws on.
  const relevant = preset?.uses ? sources.filter((s) => preset.uses!.includes(s.name)) : [];
  const how = preset?.how ?? howFor(approach, relevant.length ? relevant : sources, channelId);
  return { task, approach, approachLabel: APPROACH_LABEL[approach], how };
}

/** Pick a technique from the wording of a task the developer wrote. */
function classify(task: string, sources: DataSource[]): Approach {
  const t = task.toLowerCase();
  if (/\b(photo|image|picture|scan|camera)\b/.test(t)) return "vision";
  if (/\b(transcrib|transcription|speech[- ]to[- ]text|voice notes?|audio|recordings?)/.test(t)) return "speech";
  if (/\b(remind|reminders?|notify|notifications?|alerts?|schedule|daily tips?)\b/.test(t)) return "schedule";
  if (/\b(track|status|check (?:my|an?|the)|look ?up|balance|book|booking|appointment|register|apply|order)\b/.test(t)) return "lookup";
  if (/\b(calculat|budget|how much|total|convert|interest|savings? plan|split)/.test(t)) return "compute";
  if (/\b(translat|greet|proverb|story|stories|poem|caption|summari[sz]e|rewrite|chat|conversation)/.test(t)) return "prompt";
  return sources.length ? "retrieval" : "prompt";
}

function howFor(approach: Approach, sources: DataSource[], channelId: string): string {
  const docs = sources.filter((s) => s.kind !== "live-data").map((s) => s.name);
  const live = sources.filter((s) => s.kind === "live-data").map((s) => s.name);
  const docList = docs.length ? docs.slice(0, 2).join(" and ") : "your own content";
  const liveList = live.length ? live[0] : "your system's API";
  switch (approach) {
    case "vision":
      return "N-ATLAS reads text only. Ask users to describe what they see, or add a separate image model and pass its description to N-ATLAS.";
    case "schedule":
      return (
        "Store each user's preference, run a scheduled job in your backend, and have N-ATLAS write the message." +
        (channelId === "whatsapp"
          ? " On WhatsApp, messages you start outside the 24-hour customer-service window must use pre-approved template messages."
          : "")
      );
    case "lookup":
      return `Your backend fetches the facts from ${liveList} (after confirming who the user is, where it's personal), then N-ATLAS turns them into a friendly answer. If nothing is found, it says so instead of guessing.`;
    case "compute":
      return "Do the arithmetic in your code, then give N-ATLAS the numbers to explain. 8B models make calculation mistakes.";
    case "retrieval":
      return `Before each answer, find the relevant passages in ${docList} and include them in the prompt; tell N-ATLAS to answer only from them and to say when it doesn't know.`;
    case "speech":
      return "Transcribe audio with the N-ATLAS speech-recognition model for the speaker's language (Yoruba, Hausa, Igbo or Nigerian-accented English). Convert to 16 kHz mono and split into chunks of up to 30 seconds, then send the text to N-ATLAS.";
    case "prompt":
      return sources.length
        ? "N-ATLAS can do this from the system prompt alone. Add 2–3 example exchanges to the prompt to fix the tone, and save good replies as test cases."
        : "Start with the system prompt alone and test it. Add 2–3 example exchanges to fix the tone; if answers need facts the model doesn't know, add your own documents.";
  }
}

// ── Starter code ─────────────────────────────────────────────────────────────

export interface StarterCode {
  filename: string;
  /** What to install / run, shown above the code. */
  setup: string;
  code: string;
}

/**
 * A minimal Node 18+ Express backend for the chosen channel, wired to the
 * app's system prompt and a stub for its specific data sources.
 */
export function starterCode(channelId: string, sources: DataSource[]): StarterCode {
  const live = sources.filter((s) => s.kind === "live-data");
  const docs = sources.filter((s) => s.kind !== "live-data");
  const factsStub = sources.length
    ? [
        `// Ground answers in your data. Replace this with real lookups:`,
        ...live.map((s) => `//   - ${s.name}: call your API/database for this user's question`),
        ...docs.map((s) => `//   - ${s.name}: search your stored passages for the question`),
        `async function findFacts(question) {`,
        `  return ""; // return a few short lines of facts, or "" if nothing relevant`,
        `}`,
      ].join("\n")
    : `// Add your own facts here later (FAQ, documents, database lookups).\nasync function findFacts(question) {\n  return "";\n}`;

  const common = `import express from "express";
import { SYSTEM_PROMPT } from "./systemPrompt.js"; // from Launchpad's Export step

const NATLAS = process.env.NATLAS_BASE_URL ?? "http://localhost:11434/v1";

${factsStub}

async function askNatlas(question) {
  const facts = await findFacts(question);
  const system = facts
    ? SYSTEM_PROMPT + "\\n\\nAnswer only from these facts. If they don't cover the question, say so:\\n" + facts
    : SYSTEM_PROMPT;
  const res = await fetch(NATLAS + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (process.env.NATLAS_API_KEY ?? ""),
    },
    body: JSON.stringify({
      model: process.env.NATLAS_MODEL ?? "n-atlas",
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error("N-ATLAS returned HTTP " + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

const app = express();
app.use(express.json());
`;

  switch (channelId) {
    case "game":
      return {
        filename: "server.js",
        setup:
          "npm install express — your game POSTs to /npc/line and /npc/event in the background (never on the game loop) and uses its own hand-written line or event whenever fallback is true.",
        code: GAME_SERVER,
      };
    case "whatsapp":
      return {
        filename: "server.js",
        setup:
          "npm install express — then set WA_TOKEN, WA_PHONE_NUMBER_ID and WA_VERIFY_TOKEN from your Meta WhatsApp app, and point its webhook at https://your-domain/webhook.",
        code:
          common +
          `
// Meta calls this once to verify your webhook URL.
app.get("/webhook", (req, res) => {
  const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.WA_VERIFY_TOKEN;
  ok ? res.send(req.query["hub.challenge"]) : res.sendStatus(403);
});

// Incoming messages.
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge immediately; N-ATLAS can take a while
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return;
  if (msg.type !== "text") return; // voice notes arrive as type "audio": transcribe first (see the voice step)
  try {
    const reply = await askNatlas(msg.text.body);
    // Use the Graph API version your Meta app is set to.
    await fetch("https://graph.facebook.com/v21.0/" + process.env.WA_PHONE_NUMBER_ID + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.WA_TOKEN },
      body: JSON.stringify({ messaging_product: "whatsapp", to: msg.from, text: { body: reply } }),
    });
  } catch (err) {
    console.error("Reply failed:", err);
  }
});

app.listen(process.env.PORT ?? 3000);
`,
      };
    case "telegram":
      return {
        filename: "server.js",
        setup:
          "npm install express — create a bot with @BotFather, set TELEGRAM_TOKEN, then register the webhook once: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain/telegram",
        code:
          common +
          `
app.post("/telegram", async (req, res) => {
  res.sendStatus(200); // acknowledge immediately
  const msg = req.body.message;
  if (!msg?.text) return;
  try {
    const reply = await askNatlas(msg.text);
    await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: msg.chat.id, text: reply }),
    });
  } catch (err) {
    console.error("Reply failed:", err);
  }
});

app.listen(process.env.PORT ?? 3000);
`,
      };
    default:
      return {
        filename: "server.js",
        setup:
          channelId === "mobile"
            ? "npm install express — your mobile app POSTs { message } to /api/chat; keep N-ATLAS and your system prompt on the server."
            : channelId === "sms" || channelId === "ussd"
              ? "npm install express — start with this chat API, then add your SMS/USSD gateway's callback route that calls askNatlas()."
              : "npm install express — your web page POSTs { message } to /api/chat.",
        code:
          common +
          `
app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message ?? "").slice(0, 2000);
  if (!message.trim()) return res.status(400).json({ error: "message is required" });
  try {
    res.json({ reply: await askNatlas(message) });
  } catch (err) {
    res.status(502).json({ error: "N-ATLAS is unavailable, please try again." });
  }
});

app.listen(process.env.PORT ?? 3000);
`,
      };
  }
}

/** Backend for a game: in-character dialogue and validated JSON events. */
const GAME_SERVER = `import express from "express";

const NATLAS = process.env.NATLAS_BASE_URL ?? "http://localhost:11434/v1";

// Character bible: one short sheet per character. Keep each under ~150 words.
const CHARACTERS = {
  tunde:
    "You are Tunde, a cheerful 30-year-old mechanic who lives in a Lagos compound. " +
    "You speak Nigerian Pidgin, joke a lot and love agbalumo. Stay in character, " +
    "never mention being an AI, and never insult anyone's tribe or religion.",
  ngozi:
    "You are Mama Ngozi, a warm, no-nonsense trader in her fifties. You speak English " +
    "with Igbo greetings and give practical advice. Stay in character.",
};

async function chat(system, user, maxTokens, temperature) {
  const res = await fetch(NATLAS + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (process.env.NATLAS_API_KEY ?? ""),
    },
    body: JSON.stringify({
      model: process.env.NATLAS_MODEL ?? "n-atlas",
      temperature, // a little higher than the model card's 0.1, for livelier dialogue
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error("N-ATLAS returned HTTP " + res.status);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

const app = express();
app.use(express.json());

// One or two lines of dialogue for a character, given the game state.
app.post("/npc/line", async (req, res) => {
  const { character, state, action } = req.body ?? {};
  const sheet = CHARACTERS[character];
  if (!sheet) return res.status(400).json({ error: "unknown character" });
  const prompt =
    "Game state: " + JSON.stringify(state ?? {}) + "\n" +
    "Player action: " + String(action ?? "").slice(0, 300) + "\n" +
    "Reply with one or two short lines of dialogue, in character. Nothing else.";
  try {
    res.json({ line: await chat(sheet, prompt, 80, 0.7) });
  } catch {
    res.json({ line: null, fallback: true }); // the game shows a hand-written line
  }
});

// A small event the engine can run — only if the JSON passes validation.
app.post("/npc/event", async (req, res) => {
  const { location, state } = req.body ?? {};
  const names = Object.keys(CHARACTERS);
  const prompt =
    "Create one small, friendly event at " + String(location ?? "the compound").slice(0, 80) + ". " +
    "Game state: " + JSON.stringify(state ?? {}) + ". " +
    'Reply with ONLY JSON: {"title": string, "character": one of ' + JSON.stringify(names) +
    ', "goal": string, "reward": a number from 10 to 100}';
  try {
    const text = await chat("You design short events for a life-simulation game set in Nigeria.", prompt, 150, 0.8);
    const event = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const valid =
      typeof event.title === "string" &&
      names.includes(event.character) &&
      typeof event.goal === "string" &&
      Number.isFinite(event.reward) && event.reward >= 10 && event.reward <= 100;
    res.json(valid ? { event } : { event: null, fallback: true });
  } catch {
    res.json({ event: null, fallback: true });
  }
});

app.listen(process.env.PORT ?? 3000);
`;
