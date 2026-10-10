import { N_, useT } from "../i18n";
import { useWorkspace } from "../state/ProjectContext";
import { Button, Card } from "../ui";
import { LanguagePicker } from "../components/LanguageSwitcher";

const FLOW = [
  { n: "01", label: N_("Design"), blurb: N_("Talk your idea through with N-ATLAS and watch it take shape.") },
  { n: "02", label: N_("Build"), blurb: N_("A step-by-step build guide, blueprint and system prompt.") },
  { n: "03", label: N_("Knowledge"), blurb: N_("Upload the documents your app answers from.") },
  { n: "04", label: N_("Test"), blurb: N_("Try your app, save replies as test cases, and attack it — security is built in from the start.") },
  { n: "05", label: N_("Ship"), blurb: N_("Download an app you can open in a browser, with tests, CI and safety checks in code.") },
];

const DEV_FEATURES = [
  {
    title: N_("Test cases with checks"),
    body: N_(
      "Save any reply as a test. Add checks — reply language, no repetition loops, valid JSON, must / must-not mention, refusal, response time — re-run them after every change, and compare prompt versions side by side.",
    ),
  },
  {
    title: N_("Design chat"),
    body: N_(
      "Describe your idea in your own words — English, Pidgin, Yoruba, Hausa or Igbo. N-ATLAS asks the right questions while a live canvas shows who it's for, its features, data and architecture.",
    ),
  },
  {
    title: N_("Built for Nigerian languages"),
    body: N_(
      "Use Launchpad in English, Pidgin, Yoruba, Hausa or Igbo. Test messages in every language, language detection that catches a reply drifting into the wrong language, and accent-insensitive matching.",
    ),
  },
  {
    title: N_("Red-team before launch"),
    body: N_(
      "Prompt injection, system-prompt extraction and jailbreak attacks with deterministic detection — then a hardened prompt and a re-test.",
    ),
  },
  {
    title: N_("The N-ATLAS SDK"),
    body: N_(
      "One-file, zero-dependency clients for JavaScript and Python: language hints, answers from your documents, streaming, and errors that say how to fix them.",
    ),
  },
  {
    title: N_("Export that keeps working"),
    body: N_(
      "A JavaScript or Python app with its own chat page — unzip, start it, open it in your browser — plus a scored test runner, a GitHub Actions workflow and your 👍 replies as fine-tuning data.",
    ),
  },
];

export default function Landing() {
  const { newProject, workspace, setView } = useWorkspace();
  const t = useT();
  const start = newProject;
  const projectCount = workspace.order.length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-forge-200 bg-forge-50 px-3 py-1 text-xs font-semibold text-forge-700">
          {t("Powered by N-ATLAS · Nigeria's open multilingual LLM")}
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {t("Build with N-ATLAS. Ship with confidence.")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          {t(
            "Turn your AI idea into a tested, security-checked N-ATLAS application — without starting from scratch. Talk your idea through, get a build guide made for it, test it with your own data, attack it, and export real code with CI.",
          )}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{t("Choose your language")}</span>
          <LanguagePicker />
        </div>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="md" onClick={start} className="px-6 py-3 text-base">
            {t("Start Building →")}
          </Button>
          {projectCount > 0 ? (
            <Button variant="secondary" onClick={() => setView("home")} className="px-5 py-3 text-base">
              {t("My projects ({n})", { n: projectCount })}
            </Button>
          ) : (
            <a href="#how" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              {t("See how it works")}
            </a>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-400">{t("No sign-up. Point it at your Ollama instance and start building.")}</p>
      </div>

      <Card className="mx-auto mt-12 max-w-3xl p-6">
        <h2 className="text-sm font-semibold text-slate-900">{t("What is N-ATLAS?")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {t(
            "N-ATLAS is an open, Nigeria-focused large language model that understands Nigerian English, Yoruba, Hausa, and Igbo along with local context. It's great for some tasks and still learning others — so Launchpad helps you discover where N-ATLAS works for your application and test it before you deploy. Different models have different strengths; this tool helps you find N-ATLAS's.",
          )}
        </p>
      </Card>

      <div id="how" className="mt-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">{t("The workflow")}</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((f) => (
            <Card key={f.n} className="p-4">
              <div className="text-xs font-bold text-forge-500">{f.n}</div>
              <div className="mt-1 font-semibold text-slate-900">{t(f.label)}</div>
              <p className="mt-1 text-sm text-slate-500">{t(f.blurb)}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">{t("Built for developers")}</h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEV_FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <div className="font-semibold text-slate-900">{t(f.title)}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t(f.body)}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button onClick={start} className="px-6 py-3 text-base">
            {t("Start Building →")}
          </Button>
        </div>
      </div>
    </div>
  );
}
