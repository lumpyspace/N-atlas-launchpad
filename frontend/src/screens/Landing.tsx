import { useProject } from "../state/ProjectContext";
import { Button, Card } from "../ui";

const FLOW = [
  { n: "01", label: "Describe", blurb: "Tell us your idea in a sentence." },
  { n: "02", label: "Build", blurb: "Get an N-ATLAS blueprint + system prompt." },
  { n: "03", label: "Try", blurb: "Chat with your app in the playground." },
  { n: "04", label: "Evaluate", blurb: "Score quality & Nigerian context." },
  { n: "05", label: "Secure", blurb: "Attack it before anyone else does." },
  { n: "06", label: "Improve", blurb: "Apply fixes and re-test." },
  { n: "07", label: "Export", blurb: "Leave with a real starter project." },
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
          without starting from scratch. Describe it, build it, attack it, fix
          it, and export real code in minutes.
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
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f) => (
            <Card key={f.n} className="p-4">
              <div className="text-xs font-bold text-forge-500">{f.n}</div>
              <div className="mt-1 font-semibold text-slate-900">{f.label}</div>
              <p className="mt-1 text-sm text-slate-500">{f.blurb}</p>
            </Card>
          ))}
          <Card className="flex items-center justify-center bg-forge-50 p-4">
            <Button onClick={start}>Start Building →</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
