/**
 * Per-feature build advice and channel starter code.
 *
 * Each primary task in the blueprint gets the technique that will actually
 * make it work with an 8B text model — some things N-ATLAS can do from the
 * prompt alone, others need your data, code, a scheduler or another model.
 */

import type { DataSource } from "./useCases.js";

export type Approach = "prompt" | "retrieval" | "lookup" | "compute" | "schedule" | "vision";

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
  if (/(photo|image|picture|scan|camera)/.test(t)) return "vision";
  if (/(remind|reminders?|notify|notifications?|alerts?|schedule|daily tips?)/.test(t)) return "schedule";
  if (/(track|status|check (?:my|an?|the)|look ?up|balance|book|booking|appointment|register|apply|order)/.test(t)) return "lookup";
  if (/(calculat|budget|how much|total|convert|interest|savings? plan|split)/.test(t)) return "compute";
  if (/(translat|greet|proverb|story|stories|poem|caption|summari[sz]e|rewrite|chat|conversation)/.test(t)) return "prompt";
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
