import type { ComponentType } from "react";
import { N_, useT, type LangCode } from "../i18n";
import { useWorkspace } from "../state/ProjectContext";
import { Button, Card } from "../ui";
import { LanguagePicker } from "../components/LanguageSwitcher";
import {
  ArrowRightIcon,
  BookIcon,
  ChatIcon,
  CheckIcon,
  FlaskIcon,
  GlobeIcon,
  LayersIcon,
  PackageIcon,
  RocketIcon,
  ShieldIcon,
  SparklesIcon,
  ZapIcon,
} from "../ui/icons";

type Icon = ComponentType<{ size?: number; className?: string }>;

const FLOW: { icon: Icon; label: string; blurb: string }[] = [
  { icon: ChatIcon, label: N_("Design"), blurb: N_("Talk your idea through with N-ATLAS and watch it take shape.") },
  { icon: LayersIcon, label: N_("Build"), blurb: N_("A step-by-step build guide, blueprint and system prompt.") },
  { icon: BookIcon, label: N_("Knowledge"), blurb: N_("Upload the documents your app answers from.") },
  { icon: FlaskIcon, label: N_("Test"), blurb: N_("Try your app, save replies as test cases, and attack it — security is built in from the start.") },
  { icon: PackageIcon, label: N_("Ship"), blurb: N_("Download your assistant, ready to run, with safety checks built in.") },
  { icon: RocketIcon, label: N_("Go live"), blurb: N_("Ask how to put it online — Vercel, Modal, Render or your own server — then check the live link.") },
];

/** The kinds of assistant Launchpad builds (the export's channels). */
const KINDS: { icon: Icon; title: string; body: string }[] = [
  { icon: ChatIcon, title: N_("A chat page"), body: N_("A web page where customers ask questions — prices, opening hours, how-tos.") },
  { icon: ZapIcon, title: N_("A WhatsApp bot"), body: N_("The same assistant answering on WhatsApp, where most of your users already are.") },
  { icon: RocketIcon, title: N_("A Telegram bot"), body: N_("For communities and groups that live on Telegram.") },
  { icon: LayersIcon, title: N_("A chat API"), body: N_("For developers: plug it into your mobile app or an SMS/USSD service.") },
];

const DEV_FEATURES: { icon: Icon; title: string; body: string }[] = [
  {
    icon: ChatIcon,
    title: N_("Design chat"),
    body: N_(
      "Describe your idea in your own words — English, Pidgin, Yoruba, Hausa or Igbo. N-ATLAS asks the right questions while a live canvas shows who it's for, its features, data and architecture.",
    ),
  },
  {
    icon: GlobeIcon,
    title: N_("Built for Nigerian languages"),
    body: N_(
      "Use Launchpad in English, Pidgin, Yoruba, Hausa or Igbo. Test messages in every language, language detection that catches a reply drifting into the wrong language, and accent-insensitive matching.",
    ),
  },
  {
    icon: CheckIcon,
    title: N_("Test cases with checks"),
    body: N_(
      "Save any reply as a test. Add checks — reply language, no repetition loops, valid JSON, must / must-not mention, refusal, response time — re-run them after every change, and compare prompt versions side by side.",
    ),
  },
  {
    icon: ShieldIcon,
    title: N_("Red-team before launch"),
    body: N_(
      "Prompt injection, system-prompt extraction and jailbreak attacks with deterministic detection — then a hardened prompt and a re-test.",
    ),
  },
  {
    icon: ZapIcon,
    title: N_("The N-ATLAS SDK"),
    body: N_(
      "One-file, zero-dependency clients for JavaScript and Python: language hints, answers from your documents, streaming, and errors that say how to fix them.",
    ),
  },
  {
    icon: PackageIcon,
    title: N_("Export that keeps working"),
    body: N_(
      "A JavaScript or Python app with its own chat page — unzip, start it, open it in your browser — plus a scored test runner, a GitHub Actions workflow and your 👍 replies as fine-tuning data.",
    ),
  },
];

/** The hero's sample conversation, in the language the visitor picked. */
const SAMPLE: Record<LangCode, { you: string; natlas: string; tag: string }> = {
  en: {
    you: "I want an app that tells farmers the market price of their crops.",
    natlas: "Good idea! Who exactly will use it, and where are they?",
    tag: "English",
  },
  pid: {
    you: "I wan app wey go tell farmers how much their crops dey sell for market.",
    natlas: "Correct idea! Na who go use am, and where dem dey?",
    tag: "Naijá",
  },
  yo: {
    you: "Mo fẹ́ ohun èlò tí yóò sọ fún àwọn àgbẹ̀ iye owó irè oko wọn ní ọjà.",
    natlas: "Èrò tó dára ni! Ta ni yóò lò ó, níbo ni wọ́n wà?",
    tag: "Yorùbá",
  },
  ha: {
    you: "Ina son manhaja da za ta gaya wa manoma farashin amfanin gonarsu a kasuwa.",
    natlas: "Kyakkyawan ra'ayi ne! Su wa za su yi amfani da ita, kuma a ina suke?",
    tag: "Hausa",
  },
  ig: {
    you: "Achọrọ m ngwa ga-agwa ndị ọrụ ugbo ọnụahịa ihe ubi ha n'ahịa.",
    natlas: "Echiche dị mma! Ònye ga-eji ya, ebee ka ha nọ?",
    tag: "Igbo",
  },
};

export default function Landing({ publicSite = false }: { publicSite?: boolean }) {
  const { newProject, workspace, setView, language } = useWorkspace();
  const t = useT();
  const projectCount = workspace.order.length;

  return (
    <div className="relative overflow-hidden">
      {/* Soft green glow behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(15,157,88,0.14),transparent_60%)]" />

      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-forge-200 bg-white/80 px-3 py-1 text-xs font-semibold text-forge-700 shadow-card">
            <SparklesIcon size={12} /> {t("Powered by N-ATLAS · Nigeria's open multilingual LLM")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[2.75rem] xl:text-[3.25rem]">
            {t("Build an AI assistant that speaks your users' language — from idea to live link.")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
            {t(
              "Describe it in English, Pidgin, Yoruba, Hausa or Igbo. Launchpad plans it with you, writes its instructions, lets you try it and checks it's safe, then gives you a ready-to-run assistant — a web chat, a WhatsApp or a Telegram bot — and walks you through putting it online.",
            )}
          </p>
          <div className="mt-7 flex flex-col items-center gap-2 lg:items-start">
            <span className="text-xs font-medium text-slate-500">{t("Choose your language")}</span>
            <LanguagePicker />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Button onClick={newProject} className="px-6 py-3 text-base shadow-pop">
              {t("Start Building →")}
            </Button>
            {projectCount > 0 ? (
              <Button variant="secondary" onClick={() => setView("home")} className="px-5 py-3 text-base">
                {t("My projects ({n})", { n: projectCount })}
              </Button>
            ) : (
              <a href="#how" className="px-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
                {t("See how it works")}
              </a>
            )}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            {publicSite ? t("No sign-up — your projects stay in your browser.") : t("No sign-up. Point it at your Ollama instance and start building.")}
          </p>
        </div>

        <HeroPreview language={language} />
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center text-xs font-bold uppercase tracking-[0.18em] text-forge-600">{t("What you can build")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight text-ink">
          {t("An assistant that answers questions and guides people — from your own information, in their language.")}
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k) => (
            <Card key={k.title} className="p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forge-50 text-forge-600">
                <k.icon size={18} />
              </span>
              <div className="mt-3 font-semibold text-slate-900">{t(k.title)}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{t(k.body)}</p>
            </Card>
          ))}
        </div>
        <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <b>{t("Good to know:")}</b>{" "}
          {t(
            "Launchpad builds assistants, not every kind of app. Accounts, payments or a database aren't built for you — a developer can add them to the code you download. And to put your assistant online, it needs an N-ATLAS server; the Go live guide explains your options.",
          )}
        </div>
        <div className="mx-auto mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <SparklesIcon size={16} className="mt-0.5 text-forge-600" />
            <span>
              <b className="text-slate-900">{t("Groq does the thinking")}</b>
              <span className="block text-slate-500">{t("It asks the questions, writes the plan and your assistant's instructions, and answers your questions along the way.")}</span>
            </span>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <GlobeIcon size={16} className="mt-0.5 text-forge-600" />
            <span>
              <b className="text-slate-900">{t("N-ATLAS speaks your language")}</b>
              <span className="block text-slate-500">{t("It understands you in Pidgin, Yoruba, Hausa or Igbo, puts everything into your language — and it's the model your assistant runs on.")}</span>
            </span>
          </div>
        </div>
      </section>

      <section id="how" className="relative mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center text-xs font-bold uppercase tracking-[0.18em] text-forge-600">{t("The workflow")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight text-ink">
          {t("Six steps from an idea in your language to an app people can use.")}
        </p>
        <ol className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {FLOW.map((f, i) => (
            <li key={f.label} className="relative">
              {i < FLOW.length - 1 && <span aria-hidden className="absolute left-[calc(50%+1.75rem)] top-6 hidden h-px w-[calc(100%-3.5rem)] bg-forge-200 lg:block" />}
              <div className="flex flex-col items-center text-center">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-forge-200 bg-white text-forge-600 shadow-card">
                  <f.icon size={20} />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-forge-500 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </span>
                <div className="mt-3 font-semibold text-slate-900">{t(f.label)}</div>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{t(f.blurb)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-16">
        <Card className="mx-auto max-w-3xl p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forge-50 text-forge-600">
              <GlobeIcon size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">{t("What is N-ATLAS?")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {t(
                  "N-ATLAS is an open, Nigeria-focused large language model that understands Nigerian English, Yoruba, Hausa, and Igbo along with local context. It's great for some tasks and still learning others — so Launchpad helps you discover where N-ATLAS works for your application and test it before you deploy. Different models have different strengths; this tool helps you find N-ATLAS's.",
                )}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center text-xs font-bold uppercase tracking-[0.18em] text-forge-600">{t("Built for developers")}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEV_FEATURES.map((f) => (
            <Card key={f.title} className="group p-5 transition-shadow hover:shadow-pop">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forge-50 text-forge-600 transition-colors group-hover:bg-forge-500 group-hover:text-white">
                <f.icon size={18} />
              </span>
              <div className="mt-3 font-semibold text-slate-900">{t(f.title)}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t(f.body)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-forge-600 via-forge-700 to-[#063d24] px-8 py-12 text-center text-white shadow-pop">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("Ready to build in your language?")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-forge-100">{t("Start with one sentence about your idea. Launchpad takes it from there.")}</p>
          <button
            onClick={newProject}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-forge-700 shadow-sm transition-colors hover:bg-forge-50"
          >
            {t("Start Building →")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** A glimpse of the product: the Design chat in the visitor's language, through to a live link. */
function HeroPreview({ language }: { language: LangCode }) {
  const t = useT();
  const s = SAMPLE[language] ?? SAMPLE.en;
  const steps = [N_("Design"), N_("Build"), N_("Test"), N_("Ship")];
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-forge-200/50 via-transparent to-amber-200/40 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-forge-400" />
          <span className="ml-2 text-xs font-medium text-slate-500">
            {t("Design chat")} · {s.tag}
          </span>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-forge-500 px-4 py-2.5 text-sm leading-relaxed text-white">{s.you}</p>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-forge-600">N-ATLAS</div>
              {s.natlas}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {steps.map((step) => (
              <span key={step} className="inline-flex items-center gap-1 rounded-full bg-forge-50 px-2 py-0.5 text-[11px] font-medium text-forge-700">
                <CheckIcon size={10} /> {t(step)}
              </span>
            ))}
            <ArrowRightIcon size={12} className="text-slate-300" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-forge-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-forge-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-500" />
              {t("Live")} · kano-prices.vercel.app
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
