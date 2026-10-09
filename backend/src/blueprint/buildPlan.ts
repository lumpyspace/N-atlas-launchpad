/**
 * Build plan — turns an app idea into concrete instructions for building it
 * with N-ATLAS: how the pieces fit together, which N-ATLAS models to use, the
 * steps in order, and where N-ATLAS is (and isn't) a good fit.
 *
 * Deterministic and keyword-driven like the rest of the blueprint, so it is
 * instant and testable. Every claim about N-ATLAS comes from NATLAS_FACTS,
 * which is sourced from the official model cards — update it there, not inline.
 */

import { planFeature, starterCode, type FeaturePlan, type StarterCode } from "./features.js";
import type { Sector } from "./types.js";
import { detectUseCases, type DataSource } from "./useCases.js";

/**
 * Verified from the Hugging Face model cards (checked 2026-10-09):
 *   https://huggingface.co/NCAIR1/N-ATLaS
 *   https://huggingface.co/NCAIR1/Yoruba-ASR (and Hausa-ASR, Igbo-ASR, NigerianAccentedEnglish)
 */
export const NATLAS_FACTS = {
  model: "NCAIR1/N-ATLaS",
  base: "Llama-3 8B",
  officialLanguages: ["English", "Hausa", "Igbo", "Yoruba"],
  contextTokens: 8092,
  recommended: { temperature: 0.1, repetitionPenalty: 1.12 },
  yorubaHumanEval: "2.69/5",
  license: {
    name: "N-ATLaS Terms of Use v1.0",
    userCap: "no more than 1,000 active end-users in a rolling 30-day period",
    commercial: "commercial or large-scale use needs a separate licence from Awarri Technologies",
    attribution: "Awarri Technologies and the Federal Ministry of Communications, Innovation and Digital Economy",
    prohibited: "surveillance, discriminatory profiling, disinformation or impersonation, and military use",
  },
  gated: true,
  asr: [
    { lang: "Yoruba", model: "NCAIR1/Yoruba-ASR" },
    { lang: "Hausa", model: "NCAIR1/Hausa-ASR" },
    { lang: "Igbo", model: "NCAIR1/Igbo-ASR" },
    { lang: "English", model: "NCAIR1/NigerianAccentedEnglish" },
  ],
  asrDetails: "Whisper Small fine-tunes (~244M parameters), 16 kHz audio, up to 30 s per call",
  tts: false,
  /** Community 4-bit build that runs in Ollama/llama.cpp (not an official NCAIR release). */
  gguf: { repo: "QuantFactory/N-ATLaS-GGUF", file: "N-ATLaS.Q4_K_M.gguf", sizeGb: 4.9 },
} as const;

export type ChannelId = "web" | "whatsapp" | "telegram" | "sms" | "ussd" | "voice" | "mobile";

export interface BuildStep {
  title: string;
  detail: string;
  /** Optional shell/code block. */
  code?: string;
  /** Launchpad step that helps with this, if any. */
  launchpadStep?: "playground" | "evaluate" | "compare" | "secure" | "export";
}

export interface ArchitectureNode {
  label: string;
  detail: string;
  kind: "user" | "yours" | "natlas" | "optional";
}

export interface BuildPlan {
  /** The kind(s) of app detected, e.g. "Farm advisory + Market price information". */
  useCase: { ids: string[]; label: string; summary: string };
  /** What a first version should include. */
  mvp: string[];
  /** Where this app's facts must come from. */
  dataSources: DataSource[];
  /** How to build each primary task. */
  features: FeaturePlan[];
  /** Mistakes specific to this kind of app. */
  pitfalls: string[];
  /** How to tell whether it's working. */
  metrics: string[];
  /** A short example of the finished app. */
  conversation: { user: string; app: string };
  /** Realistic messages to test with. */
  testMessages: string[];
  /** Backend for the chosen channel, wired to the system prompt. */
  starter: StarterCode;
  channel: { id: ChannelId; label: string; why: string };
  voice: { needed: boolean; models: { lang: string; model: string }[] };
  knowledge: { needed: boolean; why: string; kind: "documents" | "live-data" | "none" };
  architecture: ArchitectureNode[];
  steps: BuildStep[];
  goodFit: string[];
  watchOut: string[];
  license: string[];
}

// ── Detection ────────────────────────────────────────────────────────────────

const CHANNELS: { id: ChannelId; label: string; re: RegExp }[] = [
  { id: "whatsapp", label: "WhatsApp", re: /\bwhats\s?app\b/i },
  { id: "telegram", label: "Telegram", re: /\btelegram\b/i },
  { id: "ussd", label: "USSD", re: /\bussd\b|\*\d{3}#/i },
  { id: "sms", label: "SMS", re: /\bsms\b|\btext messages?\b/i },
  { id: "voice", label: "Voice", re: /\bvoice\b|\bspeak|\bspoken\b|\baudio\b|\bphone calls?\b|\bcall (?:in|centre|center)\b|\billiterate\b|\bcan(?:not|'t) read\b/i },
  { id: "mobile", label: "Mobile app", re: /\bmobile app\b|\bandroid\b|\bios app\b|\bflutter\b|\breact native\b/i },
  { id: "web", label: "Web chat", re: /\bwebsite\b|\bweb app\b|\bweb\b|\bportal\b|\bdashboard\b/i },
];

const VOICE_RE = /\bvoice\b|\bspeak|\bspoken\b|\baudio\b|\bvoice notes?\b|\bphone calls?\b|\billiterate\b|\bcan(?:not|'t) read\b|\blow[- ]literacy\b/i;

// Facts that change or are specific to one organisation: the model can't know them.
const DOCUMENT_RE = /\bprices?\b|\bfees?\b|\btariffs?\b|\bregulations?\b|\bpolic(?:y|ies)\b|\blaws?\b|\bstatutes?\b|\bcut[- ]?off\b|\brequirements?\b|\bsyllabus\b|\bcurriculum\b|\bmenu\b|\bcatalog(?:ue)?\b|\bproducts?\b|\bfaqs?\b|\bhandbook\b|\bguidelines?\b|\bschedules?\b|\btimetables?\b|\bour\b|\bmy (?:business|company|shop|school|clinic)\b/i;
const LIVE_DATA_RE = /\borders?\b|\bdeliver(?:y|ies)\b|\btrack(?:ing)?\b|\bbalance\b|\baccount\b|\bbookings?\b|\bappointments?\b|\bweather\b|\bstock\b|\binventory\b|\bstatus\b|\btransactions?\b/i;

const SECTOR_KNOWLEDGE: Record<Sector, { kind: "documents" | "live-data" | "none"; why: string }> = {
  education: { kind: "documents", why: "Admission requirements, cut-off marks and fees change every year, so they must come from current official documents, not the model's memory." },
  finance: { kind: "documents", why: "Fees, rates and product terms differ by bank and change often, so answers must be grounded in current documents." },
  agriculture: { kind: "documents", why: "Approved agrochemicals, input prices and extension-service contacts change and vary by state, so ground answers in trusted documents." },
  legal: { kind: "documents", why: "Laws and procedures must be quoted from the actual statutes or guides, not recalled by an 8B model." },
  "customer-support": { kind: "live-data", why: "Order status, delivery dates and refunds live in your systems; the model must be given them, never guess them." },
  general: { kind: "none", why: "" },
};

const LANG_TO_ASR: Record<string, string> = {
  Yoruba: "NCAIR1/Yoruba-ASR",
  Hausa: "NCAIR1/Hausa-ASR",
  Igbo: "NCAIR1/Igbo-ASR",
  "Nigerian English": "NCAIR1/NigerianAccentedEnglish",
};

function detectChannel(desc: string): BuildPlan["channel"] {
  for (const c of CHANNELS) {
    if (c.re.test(desc)) return { id: c.id, label: c.label, why: `Your description mentions ${c.label}.` };
  }
  return {
    id: "web",
    label: "Web chat",
    why: "No channel was mentioned, so this plan starts with a web chat — the quickest to build and test. WhatsApp is the usual next step for Nigerian users.",
  };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export function buildPlanFor(
  desc: string,
  sector: Sector,
  languages: string[],
  tasks: string[] = [],
): BuildPlan {
  const channel = detectChannel(desc);
  const useCases = detectUseCases(desc);
  const dataSources = dedupeBy(useCases.flatMap((u) => u.dataSources), (d) => d.name);
  const voiceNeeded = channel.id === "voice" || VOICE_RE.test(desc);
  const voiceModels = voiceNeeded
    ? languages
        .map((l) => ({ lang: l, model: LANG_TO_ASR[l] }))
        .filter((m): m is { lang: string; model: string } => !!m.model)
    : [];

  let knowledge: BuildPlan["knowledge"] = { needed: false, why: "", kind: "none" };
  const specific = useCases[0].id !== "general";
  if (specific && dataSources.length) {
    const live = dataSources.some((d) => d.kind === "live-data");
    knowledge = {
      needed: true,
      kind: live ? "live-data" : "documents",
      why: `A ${useCases.map((u) => u.label.toLowerCase()).join(" and ")} app depends on facts N-ATLAS can't know: ${dataSources.map((d) => d.name).join("; ")}.`,
    };
  } else if (LIVE_DATA_RE.test(desc)) {
    knowledge = { needed: true, kind: "live-data", why: "Your app needs facts from your own systems (e.g. orders, accounts, bookings). Your backend must look them up and pass them to N-ATLAS; the model must never guess them." };
  } else if (DOCUMENT_RE.test(desc) || SECTOR_KNOWLEDGE[sector].kind !== "none") {
    const s = SECTOR_KNOWLEDGE[sector];
    knowledge = s.kind !== "none"
      ? { needed: true, kind: s.kind, why: s.why }
      : { needed: true, kind: "documents", why: "Your app answers from specific facts (prices, rules or your own content). N-ATLAS doesn't know these, so retrieve them from your documents and include them in the prompt." };
  }

  const starter = starterCode(channel.id, dataSources);

  const architecture: ArchitectureNode[] = [
    { label: `User on ${channel.label}`, detail: voiceNeeded ? "Sends a voice note or speaks" : "Sends a message", kind: "user" },
    ...(voiceNeeded
      ? [{ label: "Speech → text", detail: "N-ATLAS ASR model for the user's language", kind: "natlas" as const }]
      : []),
    { label: "Your backend", detail: "Adds your system prompt, calls N-ATLAS, applies safety rules", kind: "yours" },
    ...(knowledge.needed
      ? [{
          label: knowledge.kind === "live-data" ? "Your data / APIs" : "Knowledge base",
          detail: dataSources.length
            ? dataSources.slice(0, 2).map((d) => d.name).join("; ")
            : knowledge.kind === "live-data" ? "Looks up orders, accounts, bookings…" : "Finds the relevant passages to quote",
          kind: "optional" as const,
        }]
      : []),
    { label: "N-ATLAS", detail: `${NATLAS_FACTS.base} served over an OpenAI-compatible API`, kind: "natlas" },
  ];

  const steps: BuildStep[] = [
    {
      title: "Get access to N-ATLAS",
      detail: `N-ATLAS is open-weights but gated: sign in to Hugging Face and accept the terms on the ${NATLAS_FACTS.model} page${voiceNeeded ? " (and on each speech model you'll use)" : ""}. There is no public hosted API — you serve it yourself.`,
    },
    {
      title: "Serve the model",
      detail:
        `For prototyping, run the community 4-bit build (~${NATLAS_FACTS.gguf.sizeGb} GB) in Ollama. On a laptop CPU expect roughly 1–2 tokens/second (about a minute per short reply); ` +
        `for real users serve it on a GPU (Ollama or vLLM), where replies take seconds. Both give an OpenAI-compatible endpoint. ` +
        `The model card recommends temperature ${NATLAS_FACTS.recommended.temperature} and a repetition penalty of ${NATLAS_FACTS.recommended.repetitionPenalty} — the penalty helps prevent looping replies.`,
      code: [
        `hf download ${NATLAS_FACTS.gguf.repo} ${NATLAS_FACTS.gguf.file} --local-dir .`,
        ``,
        `# Modelfile`,
        `FROM ./${NATLAS_FACTS.gguf.file}`,
        `PARAMETER temperature ${NATLAS_FACTS.recommended.temperature}`,
        `PARAMETER repeat_penalty ${NATLAS_FACTS.recommended.repetitionPenalty}`,
        `PARAMETER num_ctx 8192`,
        ``,
        `ollama create n-atlas -f Modelfile`,
        `# OpenAI-compatible endpoint: http://localhost:11434/v1  (model "n-atlas")`,
      ].join("\n"),
    },
    {
      title: `Build your backend (${starter.filename})`,
      detail:
        `One small service that receives the user's message${channel.id === "web" ? "" : ` from ${channel.label}`}, adds the system prompt from this blueprint${dataSources.length ? " and the relevant facts" : ""}, calls N-ATLAS and returns the reply. Keep the system prompt plus conversation history well under the ~8k-token context — trim old turns. ${starter.setup} The Export step gives you the systemPrompt.js file and a Python version.`,
      code: starter.code,
      launchpadStep: "export",
    },
  ];

  if (knowledge.needed) {
    steps.push(
      knowledge.kind === "live-data"
        ? {
            title: "Connect your data",
            detail:
              `Fill in findFacts() in ${starter.filename}: before calling N-ATLAS, look up what the user is asking about and put the result in the prompt as plain facts. Sources for this app: ${sourceList(dataSources)}. Tell the model to answer only from those facts and to say when it doesn't know — never let it invent them.`,
          }
        : {
            title: "Add your knowledge (retrieval)",
            detail:
              `Collect: ${sourceList(dataSources)}. Split them into short passages, find the 2–4 most relevant for each question (keyword search is fine to start; embeddings later) in findFacts(), and let N-ATLAS answer only from them, citing the source. Keep the total under the ~8k-token context.`,
          },
    );
  }

  if (voiceNeeded) {
    const modelList = voiceModels.length
      ? voiceModels.map((m) => `${m.lang}: ${m.model}`).join("; ")
      : NATLAS_FACTS.asr.map((m) => `${m.lang}: ${m.model}`).join("; ");
    const example = voiceModels[0]?.model ?? NATLAS_FACTS.asr[0].model;
    steps.push({
      title: "Add voice input",
      detail:
        `Transcribe each voice note with the N-ATLAS speech-recognition model for the user's language (${modelList}). ` +
        `They are ${NATLAS_FACTS.asrDetails}, so convert audio to 16 kHz mono first and split anything longer than 30 seconds. ` +
        (channel.id === "whatsapp" ? "WhatsApp voice notes arrive as Opus-encoded .ogg files, which is why the example converts with ffmpeg. " : "") +
        `Then send the text to N-ATLAS. N-ATLAS has no text-to-speech model, so reply in text or add a separate TTS service.`,
      code: [
        `# Convert to 16 kHz mono WAV (needs ffmpeg installed)`,
        `ffmpeg -i voice-note.ogg -ar 16000 -ac 1 voice-note.wav`,
        ``,
        `pip install torch transformers librosa`,
        ``,
        `import librosa`,
        `from transformers import pipeline`,
        ``,
        `asr = pipeline("automatic-speech-recognition", model="${example}")`,
        `audio, _ = librosa.load("voice-note.wav", sr=16000)`,
        `text = asr(audio)["text"]`,
      ].join("\n"),
    });
  }

  steps.push(channelStep(channel.id));

  steps.push(
    {
      title: "Test in every language your users speak",
      detail:
        "Try real messages in the Playground, save good and bad replies as test cases, and re-run them after every prompt change. Compare prompt versions side by side before you switch.",
      launchpadStep: "evaluate",
    },
    {
      title: "Attack it before launch",
      detail: "Run the security tests, apply the hardened prompt, and re-test until the critical attacks are defended.",
      launchpadStep: "secure",
    },
  );

  // ── Fit ──
  const goodFit = [
    "Conversational answers in Nigerian English, Hausa, Igbo and Yoruba",
    "Explaining, summarising and translating with local context",
    "Drafting replies a person reviews before they are sent",
  ];
  const watchOut = [
    `N-ATLAS is a ${NATLAS_FACTS.base} model, so it can state wrong facts confidently. Ground anything factual in your own data${knowledge.needed ? " (step above)" : ""}.`,
    "Replies can drift into the wrong language or loop on a phrase — use the recommended repetition penalty and add language and no-repetition checks to your tests.",
    `The context window is about ${NATLAS_FACTS.contextTokens.toLocaleString("en-US")} tokens, so long documents and long chats must be trimmed.`,
  ];
  if (languages.includes("Nigerian Pidgin")) {
    watchOut.push("Nigerian Pidgin is not one of the four officially supported languages. It may work, but test it carefully with real Pidgin speakers.");
  }
  if (languages.includes("Yoruba")) {
    watchOut.push(`Yoruba scored lowest of the four languages in the model card's human evaluation (${NATLAS_FACTS.yorubaHumanEval}). Have native speakers review Yoruba replies.`);
  }
  if (sector === "legal" || sector === "finance" || /\bhealth|medic|clinic|doctor|drug|symptom/i.test(desc)) {
    watchOut.push("This is a high-stakes domain: show a clear disclaimer, refuse to give definitive advice, and offer a route to a qualified human.");
  }
  if (channel.id === "ussd") {
    watchOut.push("USSD screens hold about 182 characters and sessions time out quickly, so slow, long model replies are a poor fit. Consider replying by SMS instead, or use short, precomputed answers.");
  }

  const license = [
    `Licence: ${NATLAS_FACTS.license.name}. Free for organisations with ${NATLAS_FACTS.license.userCap}; ${NATLAS_FACTS.license.commercial}.`,
    `Credit "${NATLAS_FACTS.license.attribution}" in your app or docs.`,
    `Not allowed: ${NATLAS_FACTS.license.prohibited}.`,
  ];

  const primary = useCases[0];
  return {
    useCase: {
      ids: useCases.map((u) => u.id),
      label: useCases.map((u) => u.label).join(" + "),
      summary: useCases.map((u) => u.summary).join(" "),
    },
    mvp: useCases.flatMap((u) => u.mvp).slice(0, 5),
    dataSources,
    features: tasks.map((t) => {
      const preset = useCases.flatMap((u) => u.tasks).find((ut) => ut.task === t);
      return planFeature(t, dataSources, channel.id, preset);
    }),
    pitfalls: dedupeBy(useCases.flatMap((u) => u.pitfalls), (p) => p),
    metrics: dedupeBy(useCases.flatMap((u) => u.metrics), (m) => m),
    conversation: primary.conversation,
    testMessages: dedupeBy(useCases.flatMap((u) => u.testMessages), (m) => m).slice(0, 6),
    starter,
    channel,
    voice: { needed: voiceNeeded, models: voiceModels },
    knowledge,
    architecture,
    steps,
    goodFit,
    watchOut,
    license,
  };
}

function channelStep(id: ChannelId): BuildStep {
  switch (id) {
    case "whatsapp":
      return {
        title: "Connect WhatsApp",
        detail:
          "Use the WhatsApp Business Platform (Meta's Cloud API) or a provider such as Twilio. Set a webhook URL that points to your backend; for each incoming message, call N-ATLAS and send the reply back through the API. Because a slow model can take a while, acknowledge long requests (\"Let me check…\") and reply when ready.",
      };
    case "telegram":
      return {
        title: "Connect Telegram",
        detail: "Create a bot with @BotFather, set its webhook to your backend, and reply to each update with N-ATLAS's answer. Telegram is free and quick to set up, which makes it a good pilot channel.",
      };
    case "sms":
      return {
        title: "Connect SMS",
        detail: "Use an SMS gateway with Nigerian coverage (e.g. Africa's Talking). Point its incoming-message callback at your backend and send replies back through it. Ask N-ATLAS for short answers — each SMS holds 160 characters.",
      };
    case "ussd":
      return {
        title: "Connect USSD",
        detail: "Use a USSD gateway (e.g. Africa's Talking). Menus must respond within the session timeout, so use USSD for choosing a topic and send the model's full answer by SMS.",
      };
    case "voice":
      return {
        title: "Connect the voice channel",
        detail: "Accept voice notes (e.g. on WhatsApp) or recorded audio in your app, transcribe them, and reply in text — or add a third-party text-to-speech service if users need to hear the answer.",
      };
    case "mobile":
      return {
        title: "Connect your mobile app",
        detail: "Have the app call your backend, never N-ATLAS directly, so your system prompt and any API key stay on the server. Stream the reply so users see it appear while it's generated.",
      };
    default:
      return {
        title: "Add a web chat",
        detail: "A simple chat page that posts to your backend and streams the reply. When it works, the same backend can serve WhatsApp or Telegram with a small adapter.",
      };
  }
}

function sourceList(sources: DataSource[]): string {
  return sources.map((d) => `${d.name} (${d.why.replace(/\.$/, "")})`).join("; ");
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = key(it);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
