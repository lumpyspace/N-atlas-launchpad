/**
 * The page helper: a small chat on every page where people ask anything along
 * the way. It knows Launchpad's map, who does what, and — when a project is
 * open — where that project stands, so "what do I do now?" gets a real answer.
 */

export interface HelpContext {
  /** The page in view, as the person sees it (e.g. "Try it"). */
  page: string;
  mode: "simple" | "developer";
  project?: {
    name: string;
    kind?: string;
    stages: { label: string; done: boolean; detail: string }[];
    next?: string;
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseHelpContext(raw: unknown): HelpContext {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const p = r.project && typeof r.project === "object" ? r.project : null;
  return {
    page: str(r.page, 80) || "Home",
    mode: r.mode === "developer" ? "developer" : "simple",
    project:
      p && typeof p.name === "string"
        ? {
            name: str(p.name, 120),
            kind: str(p.kind, 120) || undefined,
            stages: (Array.isArray(p.stages) ? p.stages : [])
              .slice(0, 10)
              .map((s: any) => ({ label: str(s?.label, 60), done: s?.done === true, detail: str(s?.detail, 160) })),
            next: str(p.next, 300) || undefined,
          }
        : undefined,
  };
}

const MAP = `LAUNCHPAD, PAGE BY PAGE (Simple-mode name → Developer-mode name)
- Language: English, Pidgin, Yoruba, Hausa or Igbo, from the menu at the top. Pages and replies use it; it can be changed any time.
- Describe it → Design: talk the idea through in a chat; a live canvas shows who it's for, its features and data. Press "Build it" when ready.
- Your plan → Build guide: what you're building, an example conversation, what the first version should do, the facts it needs, mistakes to avoid. Developer mode adds architecture, techniques, build steps, N-ATLAS limits, the licence, and a "Blueprint & system prompt" tab.
- Prompt (Developer mode only): edit the assistant's instructions (its "system prompt") and save versions.
- Your information → Knowledge: upload .txt, .md, .csv, .json or .pdf files (price lists, FAQs, opening hours); the assistant answers from them.
- Try it → Test: chat with the assistant, running on N-ATLAS; 👍 / 👎 keeps answers as test cases. Developer mode adds "Test cases & scores", "Security" (attacks on the assistant), "Compare prompt versions" and "Get code".
- Download → Ship: a folder with the assistant: a chat page and a small server (JavaScript or Python — JavaScript if unsure), with safety checks built in. A quick security check runs first.
- Put it online → Go live: a guide explains hosting step by step (Vercel, Modal, Render, Docker), then "Check my live link".
- Setup doctor (top bar): checks the connection to N-ATLAS and how to fix it.
- Simple / Developer switch: in the sidebar of a project and on My projects.
- Projects are saved in this browser; there's no account.

WHAT LAUNCHPAD BUILDS
- AI assistants that answer questions and guide people from the owner's information: a web chat page, a WhatsApp bot, a Telegram bot, or a chat API for a mobile or SMS app.
- Not full apps: accounts, payments or a database aren't built for you; a developer can add them to the downloaded code.

WHO DOES WHAT
- Groq (a fast service running an open model, gpt-oss-120b) does the thinking: the design questions, the plan, the assistant's instructions, the Go live guide and this helper.
- N-ATLAS understands Pidgin, Yoruba, Hausa and Igbo and puts answers into the person's language — and it's the model their assistant runs on.

N-ATLAS
- An open model from NCAIR (Nigeria): Llama 3 with 8 billion parameters, tuned for Nigerian English, Yoruba, Hausa and Igbo; 8,192-token context.
- It has no public API: to put an assistant online, N-ATLAS must run somewhere reachable — Ollama on a computer for testing, or a GPU server such as Modal for real users.`;

export function helperSystem(ctx: HelpContext): string {
  const p = ctx.project;
  const where = p
    ? [
        `They are working on "${p.name}"${p.kind ? ` (${p.kind})` : ""}.`,
        "Where it stands:",
        ...p.stages.map((s) => `- ${s.label}: ${s.done ? "done" : "not done"} — ${s.detail}`),
        p.next ? `Suggested next step: ${p.next}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No project is open.";
  return `You are the helper in N-ATLAS Launchpad, a friendly guide in a small chat beside every page. People may be complete beginners who have never built an app; others are developers. Answer whatever they ask — how to use Launchpad, their project, AI and N-ATLAS, code, hosting, or anything else — and help them move forward.

How to answer:
- Plain, warm words. Explain any technical word the first time you use it.
- Short: under 150 words unless they ask for more. Steps as a numbered list; commands in fenced code blocks.
- When they ask where or how to do something in Launchpad, name the exact page or button from the map below (use the ${ctx.mode === "simple" ? "Simple" : "Developer"}-mode names; they are in ${ctx.mode} mode).
- Be honest about limits (what Launchpad doesn't build; N-ATLAS needs hosting). If you don't know, say so.
- Never ask for passwords or API keys; say where they go instead (a .env file, or the host's settings page).

They are on the page: ${ctx.page}.
${where}

${MAP}`;
}
