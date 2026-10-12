/**
 * The Go live guide: what the assistant model (or N-ATLAS on its own) knows
 * when a developer asks how to put their exported app online. Everything it
 * may say about the project — folder, files, commands, settings, where
 * N-ATLAS runs — comes from here, so the answer is written for this app
 * rather than for apps in general.
 */

import { isIP } from "node:net";
import type { Connection } from "../providers/NAtlasProvider.js";
import { exportSlug, modalAppName } from "./kit.js";
import { isPrivateAddress } from "./check.js";

export interface GuideProject {
  name: string;
  lang: "js" | "python";
  /** web | whatsapp | telegram | mobile | sms | game … */
  channel: string;
  knowledge: boolean;
}

export function parseGuideProject(raw: unknown): GuideProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  return {
    name: r.name.trim().slice(0, 120),
    lang: r.lang === "python" ? "python" : "js",
    channel: typeof r.channel === "string" ? r.channel.slice(0, 20) : "web",
    knowledge: r.knowledge === true,
  };
}

/** Can an app on the internet reach this N-ATLAS server? */
export function reachableFromInternet(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    return !(isIP(host) && isPrivateAddress(host));
  } catch {
    return false;
  }
}

function natlasFacts(conn: Connection | undefined): string {
  if (!conn) return "Unknown: Launchpad isn't connected to an N-ATLAS server. They need one that's reachable from the internet.";
  if (reachableFromInternet(conn.endpoint)) {
    return (
      `On a public HTTPS server (${new URL(conn.endpoint).host}), model "${conn.model}". A hosted app can use the same ` +
      `NATLAS_BASE_URL (${conn.endpoint}) and NATLAS_MODEL, with the key they already use for it as NATLAS_API_KEY.`
    );
  }
  return (
    `On their own computer (${conn.endpoint}). A hosted app CANNOT reach localhost, so before the app can go live they ` +
    `must serve N-ATLAS somewhere public — for example on a Modal GPU with vLLM (an OpenAI-compatible endpoint), or any ` +
    `other OpenAI-compatible host — and set NATLAS_BASE_URL to it. Say this first.`
  );
}

const CHANNELS: Record<string, string> = {
  web: "a web chat page (public/index.html) that posts to POST /api/chat",
  whatsapp: "a WhatsApp bot: Meta calls POST /webhook (set WA_TOKEN, WA_PHONE_NUMBER_ID and WA_VERIFY_TOKEN too, then point the Meta app's webhook at https://<live link>/webhook); the chat page is for testing",
  telegram: "a Telegram bot: set TELEGRAM_TOKEN too, then register https://<live link>/telegram as the bot's webhook; the chat page is for testing",
  mobile: "a chat API for a mobile app: the app POSTs { message } to https://<live link>/api/chat",
  sms: "a chat API to connect to an SMS/USSD gateway's callback; the chat page is for testing",
};

/** The guide's system prompt: how to answer, and the facts about this project. */
export function guideSystem(p: GuideProject, conn: Connection | undefined): string {
  const js = p.lang === "js";
  const slug = exportSlug(p.name);
  const folder = `${slug}-${js ? "js" : "python"}`;
  const modal = modalAppName(slug);
  const test = js ? "npm test" : "python tests/run_tests.py";
  const start = js ? "npm install && npm start" : "python server.py";
  return `You are the "Go live" guide in N-ATLAS Launchpad. A developer built an app with Launchpad and downloaded it as a project folder; now they want to put it online. Answer like a senior engineer helping a friend: concrete numbered steps, the exact commands in fenced code blocks (\`\`\`bash), file names in backticks.

Rules:
- Use only the facts below about their project. Don't invent files, flags, prices or services.
- If they haven't said where to host, recommend one in a sentence or two — Modal if their N-ATLAS already runs on Modal, Vercel for the quickest free start, Render if they keep code on GitHub, Docker for their own server — and ask which they prefer. Don't dump every option at once.
- Never ask them to paste API keys or passwords into this chat. Tell them where keys go: their .env file, or the host's settings page.
- After the steps, tell them to paste their live link into "Check my live link" (under this chat) to confirm the page, a real N-ATLAS answer and the safety checks.
- Keep it short: at most 6 steps and under 200 words, unless they ask for detail. If something goes wrong, ask for the exact error message.

FACTS ABOUT THEIR PROJECT
- App: "${p.name}", downloaded as the folder \`${folder}\`: a ${js ? "JavaScript project (Node 20.12 or newer, Express)" : "Python project (standard library only, Python 3.10+)"}.
- What it is: ${CHANNELS[p.channel] ?? CHANNELS.web}.${p.knowledge ? "\n- It answers from their documents: knowledge/passages.json ships with the app." : ""}
- Run it locally first: copy \`.env.example\` to \`.env\`, fill it in, then \`${start}\` and open http://localhost:3000. Tests: \`${test}\`.
- Settings the app reads (from .env, or the host's environment variables): NATLAS_BASE_URL, NATLAS_MODEL, NATLAS_API_KEY. PORT is set by the host.
- Where their N-ATLAS runs now: ${natlasFacts(conn)}
- Hosting files already in the folder:
  - Modal — \`deploy/modal_app.py\`: \`pip install modal\`, then \`modal setup\` once (logs in through the browser), fill in \`.env\`, then \`modal deploy deploy/modal_app.py\` from the project folder. It prints the link: https://<workspace>--${modal}-web.modal.run. \`.env\` is sent as a Modal secret automatically (Secret.from_dotenv in the file) — there is NO separate \`modal secret create\` step — and it's never put in the image. Sleeps after 5 idle minutes (the next visitor waits a few seconds). Take it offline: \`modal app stop ${modal}\`.
  - Vercel — \`vercel.json\` and \`${js ? "api/index.js" : "api/index.py"}\`: \`npm i -g vercel\`, \`vercel login\`, then \`vercel deploy --prod\` in the project folder. Add the three settings in the Vercel project's Settings → Environment Variables (or \`vercel env add NATLAS_API_KEY production\`), then run \`vercel deploy --prod\` again so they apply. Each request can run up to 60 seconds.
  - Render — \`render.yaml\`: put the folder in a GitHub repo (\`.gitignore\` already keeps \`.env\` out), then in Render: New → Blueprint → pick the repo, and fill in the three settings. The free plan sleeps after 15 idle minutes.
  - Any server or container host — \`Dockerfile\` (+ \`.dockerignore\`): \`docker build -t ${slug} .\` then \`docker run -p 3000:3000 --env-file .env ${slug}\`, behind HTTPS (for example Caddy or the host's load balancer).
- Safety that travels with the app: messages over 1,000 characters are refused, 20 messages per visitor per minute (it trusts one proxy hop for the visitor's address), prompt-leak and wrong-language guards.`;
}
