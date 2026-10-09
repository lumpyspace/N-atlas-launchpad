/**
 * Playground specs — how each kind of app should be tried out.
 *
 * Not every N-ATLAS app is a chatbot. A game asks for JSON events, a writing
 * assistant fills a form, a feedback tool labels comments. Each spec gives the
 * Playground its default mode, task forms (prompt templates with {{fields}}),
 * the JSON shape expected back, and sample data for the "Your data" panel.
 *
 * Sample data is illustrative and labelled as such — developers replace it
 * with their own.
 */

import type { JsonType } from "../eval/types.js";

export interface TemplateField {
  name: string;
  label: string;
  placeholder?: string;
  default?: string;
  multiline?: boolean;
}

export interface TaskTemplate {
  id: string;
  label: string;
  /** One line on what this task tests. */
  hint: string;
  fields: TemplateField[];
  /** User message with {{field}} placeholders. */
  prompt: string;
  output: "text" | "json";
  /** Required keys and types when output is JSON. */
  schema?: Record<string, JsonType>;
  maxTokens?: number;
}

export interface PlaygroundSpec {
  /** Which mode the Playground opens in. */
  mode: "chat" | "task";
  templates: TaskTemplate[];
  /** What the "Your data" panel holds for this app, e.g. "Price table". */
  dataLabel?: string;
  /** Sample data to start from (clearly marked as a sample). */
  sampleData?: string;
}

const SAMPLE = "(SAMPLE DATA — replace with your own)";

export const PLAYGROUNDS: Record<string, PlaygroundSpec> = {
  game: {
    mode: "task",
    dataLabel: "Character bible",
    sampleData: `${SAMPLE}
Tunde: 30, cheerful mechanic in a Lagos compound. Speaks Nigerian Pidgin, jokes a lot, loves agbalumo. Friends with Ngozi.
Mama Ngozi: 50s, warm but no-nonsense trader. Speaks English with Igbo greetings. Gives practical advice.`,
    templates: [
      {
        id: "npc-line",
        label: "Character line",
        hint: "One or two lines of dialogue that react to the game state.",
        fields: [
          { name: "character", label: "Character", default: "Tunde" },
          { name: "state", label: "Game state (JSON)", default: '{"mood":"happy","relationship":60,"location":"compound","time":"evening"}' },
          { name: "action", label: "What the player did", default: "The player gives Tunde a bag of agbalumo." },
        ],
        prompt:
          "You are {{character}} (see the character bible). Game state: {{state}}. {{action}}\nReply with one or two short lines of dialogue in character. Nothing else.",
        output: "text",
        maxTokens: 80,
      },
      {
        id: "npc-event",
        label: "Game event (JSON)",
        hint: "A small event the engine can run — must be valid JSON with the right fields.",
        fields: [
          { name: "location", label: "Location", default: "the market" },
          { name: "state", label: "Game state (JSON)", default: '{"day":3,"money":1200,"weather":"rainy"}' },
        ],
        prompt:
          'Create one small, friendly event at {{location}} for a life-simulation game. Game state: {{state}}. Use only characters from the character bible. Reply with ONLY JSON: {"title": string, "character": string, "goal": string, "reward": number from 10 to 100}',
        output: "json",
        schema: { title: "string", character: "string", goal: "string", reward: "number" },
        maxTokens: 150,
      },
    ],
  },

  "small-business": {
    mode: "task",
    dataLabel: "Product and price list",
    sampleData: `${SAMPLE}
Rice (50kg bag) — ₦45,000
Indomie (carton) — ₦9,500
Eggs (crate) — ₦4,200`,
    templates: [
      {
        id: "parse-sale",
        label: "Log a sale (JSON)",
        hint: "Turn a chat message into a sale record your code can check and save.",
        fields: [{ name: "message", label: "Owner's message", default: "I sell 3 bag of rice 45k each" }],
        prompt:
          'Turn this message into a sale record: "{{message}}". Reply with ONLY JSON: {"item": string, "quantity": number, "unit_price": number}. Prices in naira as plain numbers.',
        output: "json",
        schema: { item: "string", quantity: "number", unit_price: "number" },
        maxTokens: 80,
      },
      {
        id: "marketing-post",
        label: "Marketing post",
        hint: "A short post for WhatsApp status or Instagram.",
        fields: [
          { name: "product", label: "Product", default: "New Ankara bags" },
          { name: "details", label: "Price / offer", default: "₦12,000, free delivery in Ibadan this week" },
          { name: "language", label: "Language", default: "Pidgin" },
        ],
        prompt: "Write a short, catchy {{language}} post for WhatsApp status about: {{product}} — {{details}}. Max 40 words.",
        output: "text",
        maxTokens: 120,
      },
    ],
  },

  "feedback-analysis": {
    mode: "task",
    dataLabel: "Topic labels",
    sampleData: `${SAMPLE}
Allowed topics: delivery, payments, app-login, customer-service, pricing, other
Allowed sentiment: positive, negative, mixed`,
    templates: [
      {
        id: "label-comment",
        label: "Label a comment (JSON)",
        hint: "Topic and sentiment from your fixed lists only.",
        fields: [{ name: "comment", label: "Comment", default: "The app sweet but delivery too slow for Ibadan", multiline: true }],
        prompt:
          'Label this customer comment using only the allowed topics and sentiments: "{{comment}}". Reply with ONLY JSON: {"topic": string, "sentiment": string, "reason": string}',
        output: "json",
        schema: { topic: "string", sentiment: "string", reason: "string" },
        maxTokens: 100,
      },
      {
        id: "summarise",
        label: "Summarise feedback",
        hint: "Main themes with example quotes.",
        fields: [
          {
            name: "comments",
            label: "Comments (one per line)",
            multiline: true,
            default: "Delivery too slow\nI no fit login since yesterday\nCustomer care helped me fast, thank you\nWhy una charge me twice?",
          },
        ],
        prompt: "Summarise the main themes in these customer comments in 3 bullet points, each with one example quote:\n{{comments}}",
        output: "text",
        maxTokens: 250,
      },
    ],
  },

  "writing-assistant": {
    mode: "task",
    dataLabel: "Letter templates",
    sampleData: `${SAMPLE}
Formal letter layout: sender's address and date (top right), recipient's address (left), salutation, subject line in capitals, body, "Yours faithfully" (unnamed recipient) or "Yours sincerely" (named), name and signature.`,
    templates: [
      {
        id: "draft-letter",
        label: "Draft a letter",
        hint: "A complete draft the user will review before sending.",
        fields: [
          { name: "type", label: "Type", default: "Formal letter" },
          { name: "recipient", label: "To", default: "The Chairman, Ikorodu Local Government" },
          { name: "purpose", label: "Purpose", default: "Request repair of the road on Ogolonto Street" },
          { name: "details", label: "Key details", multiline: true, default: "Road has had potholes for 8 months; two accidents last month; residents willing to meet." },
        ],
        prompt: "Write a {{type}} to {{recipient}}. Purpose: {{purpose}}. Details: {{details}}. Use the layout in the templates. Leave [placeholders] for any name, date or address not given — don't invent them.",
        output: "text",
        maxTokens: 400,
      },
      {
        id: "rewrite",
        label: "Rewrite text",
        hint: "Make text simpler, more polite, or translate it.",
        fields: [
          { name: "text", label: "Text", multiline: true, default: "Send me the money today or I will report you." },
          { name: "style", label: "Make it…", default: "polite and professional" },
        ],
        prompt: "Rewrite this to be {{style}}, keeping the meaning:\n{{text}}",
        output: "text",
        maxTokens: 200,
      },
    ],
  },

  translation: {
    mode: "task",
    dataLabel: "Glossary",
    sampleData: `${SAMPLE}
customer → oníbàárà (Yoruba)
delivery → isar da kaya (Hausa)`,
    templates: [
      {
        id: "translate",
        label: "Translate",
        hint: "Check meaning, tone marks and glossary terms.",
        fields: [
          { name: "text", label: "Text", multiline: true, default: "Your order will arrive tomorrow morning." },
          { name: "target", label: "Into", default: "Yoruba" },
        ],
        prompt: "Translate into {{target}}, using the glossary terms where they apply. Reply with the translation only:\n{{text}}",
        output: "text",
        maxTokens: 200,
      },
    ],
  },

  content: {
    mode: "task",
    templates: [
      {
        id: "write",
        label: "Write a piece",
        hint: "Stories, posts or proverbs in your style.",
        fields: [
          { name: "kind", label: "What", default: "short bedtime folktale" },
          { name: "topic", label: "About", default: "the tortoise and the birds" },
          { name: "audience", label: "For", default: "children aged 6–9" },
          { name: "language", label: "Language", default: "English with a few Igbo words" },
        ],
        prompt: "Write a {{kind}} about {{topic}} for {{audience}} in {{language}}. Under 200 words.",
        output: "text",
        maxTokens: 350,
      },
    ],
  },

  jobs: {
    mode: "task",
    dataLabel: "CV checklist",
    sampleData: `${SAMPLE}
1. Most recent role first  2. Results with numbers  3. One-page for under 5 years' experience  4. No photo, age or religion needed  5. Professional email address`,
    templates: [
      {
        id: "review-cv",
        label: "Review a CV",
        hint: "Feedback against your checklist.",
        fields: [
          { name: "role", label: "Target role", default: "Bank teller" },
          { name: "cv", label: "CV text", multiline: true, default: "Objective: To work in a reputable organisation...\nNYSC, Kaduna 2024\nB.Sc Accounting, UNIBEN 2023" },
        ],
        prompt: "Review this CV for a {{role}} role against the checklist. Give 3 specific improvements:\n{{cv}}",
        output: "text",
        maxTokens: 300,
      },
    ],
  },

  "news-factcheck": {
    mode: "task",
    dataLabel: "Trusted sources",
    sampleData: `${SAMPLE}
[Source A, 2 Oct] The state government announced a ban on commercial motorcycles on highways in 6 LGAs from 1 November.
[Source B, 4 Oct] Officials said the ban does not apply to other states.`,
    templates: [
      {
        id: "check-claim",
        label: "Check a claim (JSON)",
        hint: "Must say \"unverified\" when the sources don't cover it.",
        fields: [{ name: "claim", label: "Claim", multiline: true, default: "Dem don ban okada for all states from next month." }],
        prompt:
          'Check this claim using ONLY the sources: "{{claim}}". Reply with ONLY JSON: {"verdict": "supported" | "contradicted" | "unverified", "source": string, "explanation": string}',
        output: "json",
        schema: { verdict: "string", source: "string", explanation: "string" },
        maxTokens: 200,
      },
    ],
  },

  transcription: {
    mode: "task",
    dataLabel: "Names and terms",
    sampleData: `${SAMPLE}
Speakers: Mrs Adebayo (chair), Mr Okafor (treasurer)
Terms: esusu, levy, AGM`,
    templates: [
      {
        id: "minutes",
        label: "Transcript → minutes",
        hint: "Paste a transcript (audio upload comes later). Check names and numbers.",
        fields: [
          {
            name: "transcript",
            label: "Transcript",
            multiline: true,
            default: "Adebayo: We agree the levy is two thousand naira per member. Okafor: I will collect it before the end of the month. Adebayo: Next meeting is the first Saturday of November.",
          },
        ],
        prompt: "Write meeting minutes from this transcript: decisions, action items (with owners) and next meeting date. Use only what was said:\n{{transcript}}",
        output: "text",
        maxTokens: 300,
      },
    ],
  },

  recipes: {
    mode: "task",
    dataLabel: "Your recipes",
    sampleData: `${SAMPLE}
Jollof rice (serves 4): 3 cups rice, 6 tomatoes, 2 red bell peppers, 2 scotch bonnets, 1 onion, 1/2 cup oil, 2 stock cubes. Allergens: none listed.`,
    templates: [
      {
        id: "suggest",
        label: "Suggest a meal",
        hint: "Only from your recipes; warn about allergens.",
        fields: [
          { name: "ingredients", label: "Ingredients I have", default: "rice, tomatoes, pepper, onion, chicken" },
          { name: "people", label: "People", default: "4" },
        ],
        prompt: "I have {{ingredients}}. Suggest a meal from the recipes for {{people}} people and list what I'm missing.",
        output: "text",
        maxTokens: 250,
      },
    ],
  },

  travel: {
    mode: "task",
    dataLabel: "Verified places",
    sampleData: `${SAMPLE}
Calabar: Obudu Mountain Resort (day trip, book ahead), Marina Resort (open daily), Calabar Carnival (December).`,
    templates: [
      {
        id: "itinerary",
        label: "Plan an itinerary",
        hint: "Only places from your verified list.",
        fields: [
          { name: "city", label: "City", default: "Calabar" },
          { name: "days", label: "Days", default: "2" },
          { name: "budget", label: "Budget", default: "moderate" },
        ],
        prompt: "Plan a {{days}}-day {{budget}} trip in {{city}} using only the verified places.",
        output: "text",
        maxTokens: 300,
      },
    ],
  },

  "exam-prep": {
    mode: "chat",
    dataLabel: "Question bank item",
    sampleData: `${SAMPLE}
Q14 (Chemistry, UTME): Which of these is a noble gas? A) Nitrogen B) Argon C) Oxygen D) Chlorine. Answer: B.`,
    templates: [
      {
        id: "explain-answer",
        label: "Explain an answer",
        hint: "The key is given — the model must explain it, not decide it.",
        fields: [
          { name: "question", label: "Question", multiline: true, default: "Which of these is a noble gas? A) Nitrogen B) Argon C) Oxygen D) Chlorine" },
          { name: "answer", label: "Correct answer (from the key)", default: "B" },
          { name: "student", label: "Student chose", default: "C" },
        ],
        prompt: "Question: {{question}}\nCorrect answer: {{answer}}. The student chose {{student}}. Explain kindly why {{answer}} is correct and why {{student}} isn't, in 3 sentences.",
        output: "text",
        maxTokens: 200,
      },
    ],
  },

  // Chat apps whose answers depend on data: chat mode plus sample data.
  "market-prices": {
    mode: "chat",
    dataLabel: "Today's price table",
    sampleData: `${SAMPLE}
Date: (today)  Market: Mile 12, Lagos
Tomatoes (big basket) — ₦—
Rice, local (50kg bag) — ₦—
Garri, white (paint) — ₦—`,
    templates: [],
  },
  "farm-advisory": {
    mode: "chat",
    dataLabel: "Crop calendar extract",
    sampleData: `${SAMPLE}
Oyo State, maize: plant when rains are established (usually late March–April); second season July–August. Confirm onset with this year's NiMet forecast.`,
    templates: [],
  },
  "customer-support": {
    mode: "chat",
    dataLabel: "Order record",
    sampleData: `${SAMPLE}
Order 10234: 1 × sneakers (size 42), paid. Status: shipped from Lagos warehouse yesterday. Expected delivery: Thursday. Return policy: 7 days, unworn items.`,
    templates: [],
  },
  "fintech-support": {
    mode: "chat",
    dataLabel: "Fee schedule extract",
    sampleData: `${SAMPLE}
Transfers ₦5,000 and below: ₦—. Above ₦5,000: ₦—. Failed transfers are reversed automatically within 24 hours; after that, raise a dispute in the app.`,
    templates: [],
  },
  "legal-rights": {
    mode: "chat",
    dataLabel: "Law extract",
    sampleData: `${SAMPLE}
Paste the exact sections of the law you rely on here (e.g. the notice provisions of the Lagos State Tenancy Law 2011), with section numbers.`,
    templates: [],
  },
  property: {
    mode: "chat",
    dataLabel: "Verified listings",
    sampleData: `${SAMPLE}
L1: 2-bedroom flat, Yaba — ₦—/year + service charge ₦—. Verified (date). Agent: (verified agent).`,
    templates: [],
  },
  transport: {
    mode: "chat",
    dataLabel: "Route and fare data",
    sampleData: `${SAMPLE}
Ikorodu → TBS (BRT): board at Ikorodu terminal; fare ₦— (checked: date).`,
    templates: [],
  },
  "gov-services": {
    mode: "chat",
    dataLabel: "Official page extract",
    sampleData: `${SAMPLE}
Paste the current steps and fees from the official agency page here, with the date you checked it.`,
    templates: [],
  },
  faith: {
    mode: "chat",
    dataLabel: "Stored scripture / devotional",
    sampleData: `${SAMPLE}
Paste the passage text (from a translation you're licensed to use) and today's devotional here.`,
    templates: [],
  },
  "health-info": {
    mode: "chat",
    dataLabel: "Health guidance extract",
    sampleData: `${SAMPLE}
Paste the official guidance you rely on here, and your list of danger signs that must always be referred.`,
    templates: [],
  },
};

const CHAT_ONLY: PlaygroundSpec = { mode: "chat", templates: [] };

/** Spec for the detected use cases: the first one's, plus the second's tasks. */
export function playgroundFor(useCaseIds: string[]): PlaygroundSpec {
  const [first, second] = useCaseIds.map((id) => PLAYGROUNDS[id]);
  const base = first ?? CHAT_ONLY;
  if (!second) return base;
  return {
    ...base,
    templates: [...base.templates, ...second.templates].slice(0, 4),
    sampleData: [base.sampleData, second.sampleData].filter(Boolean).join("\n\n") || undefined,
    dataLabel: base.dataLabel ?? second.dataLabel,
  };
}
