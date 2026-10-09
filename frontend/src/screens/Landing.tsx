import { useProject } from "../state/ProjectContext";
import { Button, Card } from "../ui";

const FLOW = [
  { n: "01", label: "Design", blurb: "Talk your idea through with N-ATLAS and watch it take shape." },
  { n: "02", label: "Build", blurb: "A step-by-step build guide, blueprint and system prompt." },
  { n: "03", label: "Test", blurb: "Try your app, save replies as test cases, score it." },
  { n: "04", label: "Secure", blurb: "Attack it before anyone else does." },
  { n: "05", label: "Improve", blurb: "Apply fixes and re-test." },
  { n: "06", label: "Export", blurb: "Leave with code, tests, CI and training data." },
];

const DEV_FEATURES = [
  {
    title: "Test cases with checks",
    body: "Save any reply as a test. Add checks — reply language, no repetition loops, valid JSON, must / must-not mention, refusal, response time — re-run them after every change, and compare prompt versions side by side.",
  },
  {
    title: "Design chat",
    body: "Describe your idea in your own words — English, Pidgin, Yoruba, Hausa or Igbo. N-ATLAS asks the right questions while a live canvas shows who it's for, its features, data and architecture.",
  },
  {
    title: "Built for Nigerian languages",
    body: "Pidgin, Yoruba, Hausa and Igbo test messages, language detection that catches a reply drifting into the wrong language, and accent-insensitive matching.",
  },
  {
    title: "Red-team before launch",
    body: "Prompt injection, system-prompt extraction and jailbreak attacks with deterministic detection — then a hardened prompt and a re-test.",
  },
  {
    title: "Copy as code",
    body: "Get the exact request — system prompt, language and settings — as JavaScript, Python or curl for any OpenAI-compatible N-ATLAS endpoint.",
  },
  {
    title: "Export that keeps working",
    body: "A runnable JS or Python project with a scored test runner, a GitHub Actions workflow, and your 👍 replies as fine-tuning data (JSONL).",
  },
];

export default function Landing() {
  const { dispatch } = useProject();
  const start = () => dispatch({ type: "setStep", step: "describe" });

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-forge-200 bg-forge-50 px-3 py-1 text-xs font-semibold text-forge-700">
          Powered by N-ATLAS · Nigeria's open multilingual LLM
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Build with N-ATLAS. Ship with confidence.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Turn your AI idea into a tested, security-checked N-ATLAS application —
          without starting from scratch. Talk your idea through, get a build
          guide made for it, test it with your own data, attack it, and export
          real code with CI.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="md" onClick={start} className="px-6 py-3 text-base">
            Start Building →
          </Button>
          <a href="#how" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            See how it works
          </a>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          No sign-up. Point it at your Ollama instance and start building.
        </p>
      </div>

      <Card className="mx-auto mt-12 max-w-3xl p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          What is N-ATLAS?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          N-ATLAS is an open, Nigeria-focused large language model that
          understands Nigerian English, Yoruba, Hausa, and Igbo along with local
          context. It's great for some tasks and still learning others — so
          Launchpad helps you{" "}
          <span className="font-medium text-slate-800">
            discover where N-ATLAS works for your application
          </span>{" "}
          and test it before you deploy. Different models have different
          strengths; this tool helps you find N-ATLAS's.
        </p>
      </Card>

      <div id="how" className="mt-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          The workflow
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((f) => (
            <Card key={f.n} className="p-4">
              <div className="text-xs font-bold text-forge-500">{f.n}</div>
              <div className="mt-1 font-semibold text-slate-900">{f.label}</div>
              <p className="mt-1 text-sm text-slate-500">{f.blurb}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          Built for developers
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEV_FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <div className="font-semibold text-slate-900">{f.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.body}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button onClick={start} className="px-6 py-3 text-base">
            Start Building →
          </Button>
        </div>
      </div>
    </div>
  );
}
