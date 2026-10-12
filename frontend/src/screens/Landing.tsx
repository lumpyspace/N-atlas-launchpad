import type { ComponentType, ReactNode } from "react";
import { N_, useT, type LangCode } from "../i18n";
import { useWorkspace } from "../state/ProjectContext";
import { LanguagePicker } from "../components/LanguageSwitcher";
import {
  BookIcon,
  ChatIcon,
  CheckIcon,
  FlaskIcon,
  GlobeIcon,
  LayersIcon,
  RocketIcon,
  ShieldIcon,
  ZapIcon,
} from "../ui/icons";

type Icon = ComponentType<{ size?: number; className?: string }>;

const FLOW: { icon: Icon; label: string; blurb: string }[] = [
  { icon: ChatIcon, label: N_("Describe"), blurb: N_("Say what you want in a sentence or two — in your own language.") },
  { icon: LayersIcon, label: N_("Build"), blurb: N_("A step-by-step build guide, blueprint and system prompt.") },
  { icon: BookIcon, label: N_("Knowledge"), blurb: N_("Upload the documents your app answers from.") },
  { icon: FlaskIcon, label: N_("Your site"), blurb: N_("Groq writes your website's pages; you check them, pick a look and switch on plugins — prices, orders, WhatsApp.") },
  { icon: RocketIcon, label: N_("Publish"), blurb: N_("One click gives it a link anyone can open. Share it on WhatsApp.") },
];

/** The kinds of assistant Launchpad builds (the export's channels). */
const KINDS: { icon: Icon; title: string; body: string }[] = [
  { icon: LayersIcon, title: N_("A website"), body: N_("Pages for your business — home, prices, questions, contact — in a theme you pick.") },
  { icon: ChatIcon, title: N_("An assistant on every page"), body: N_("It answers from your own pages, in English, Pidgin, Yoruba, Hausa or Igbo.") },
  { icon: ZapIcon, title: N_("Orders & bookings"), body: N_("Visitors order in conversation; confirmed ones land in your inbox. Plus a WhatsApp button.") },
  { icon: RocketIcon, title: N_("Publish in one click"), body: N_("A link anyone can open on a phone — no code, no server, no hosting to set up.") },
];

const DEV_FEATURES: { icon: Icon; title: string; body: string }[] = [
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
];

/** The hero's sample conversation, in the language the visitor picked. */
const SAMPLE: Record<LangCode, { you: string; natlas: string; tag: string }> = {
  en: {
    you: "How much is a bag of rice?",
    natlas: "A 50kg bag of rice is ₦82,000. Would you like to place an order?",
    tag: "English",
  },
  pid: {
    you: "How much be one bag of rice?",
    natlas: "One 50kg bag of rice na ₦82,000. You wan order?",
    tag: "Naijá",
  },
  yo: {
    you: "Èló ni àpò ìrẹsì kan?",
    natlas: "Àpò ìrẹsì 50kg jẹ́ ₦82,000. Ṣé o fẹ́ ra?",
    tag: "Yorùbá",
  },
  ha: {
    you: "Nawa ne buhun shinkafa ɗaya?",
    natlas: "Buhun shinkafa na 50kg ₦82,000 ne. Kana so ka yi oda?",
    tag: "Hausa",
  },
  ig: {
    you: "Ego ole ka otu akpa osikapa bụ?",
    natlas: "Akpa osikapa 50kg bụ ₦82,000. Ị chọrọ ịzụ?",
    tag: "Igbo",
  },
};

export default function Landing({ publicSite = false }: { publicSite?: boolean }) {
  const { newProject, workspace, setView, language } = useWorkspace();
  const t = useT();
  const projectCount = workspace.order.length;

  /** The headline, its last words set in italic green — the editorial touch. */
  const headline = t("Build a website with an AI assistant that speaks your customers' language — from idea to live link.");
  const [lead, tail] = (() => {
    const [main, ...rest] = headline.split(" — ");
    if (rest.length) return [`${main} —`, rest.join(" — ")];
    const words = main.split(" ");
    const cut = Math.max(1, words.length - 2);
    return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
  })();

  return (
    <div className="bg-paper text-ink">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pt-24">
        <div>
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
            <span className="h-px w-8 bg-forge-500" />
            {t("Powered by N-ATLAS · Nigeria's open multilingual LLM")}
          </div>
          <h1 className="mt-8 font-serif text-[2.6rem] leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.1rem]">
            {lead} <em className="italic text-forge-600">{tail}</em>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-stone-600">
            {t(
              "Describe it in English, Pidgin, Yoruba, Hausa or Igbo. Groq builds your website — pages, a theme, and plugins like a price list, orders and WhatsApp — with an N-ATLAS assistant on every page. Check it, then publish it to a link anyone can open.",
            )}
          </p>
          <div className="mt-8">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">{t("Choose your language")}</div>
            <LanguagePicker />
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <button onClick={newProject} className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-3.5 text-sm font-medium tracking-wide text-paper transition-opacity hover:opacity-90">
              {t("Start Building →").replace(/\s*→\s*$/, "")}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            {projectCount > 0 ? (
              <button onClick={() => setView("home")} className="text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700">
                {t("My projects ({n})", { n: projectCount })}
              </button>
            ) : (
              <a href="#how" className="text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700">
                {t("See how it works")}
              </a>
            )}
          </div>
          <p className="mt-6 text-xs text-stone-400">
            {publicSite ? t("No sign-up — your projects stay in your browser.") : t("No sign-up. Point it at your Ollama instance and start building.")}
          </p>
        </div>
        <HeroPreview language={language} />
      </section>

      {/* 01 What you can build */}
      <Chapter n="01" title={t("What you can build")} intro={t("A small website for your business, with an assistant that answers your customers in their language.")}>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {KINDS.map((k) => (
            <div key={k.title} className="border-t border-stone-300 pt-5">
              <k.icon size={18} className="text-forge-600" />
              <div className="mt-3 font-serif text-xl">{t(k.title)}</div>
              <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">{t(k.body)}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-2xl border-l-2 border-amber-400 pl-4 text-sm leading-relaxed text-stone-600">
          <b className="font-semibold text-stone-800">{t("Good to know:")}</b>{" "}
          {t(
            "Launchpad builds small websites with an assistant, WordPress-style — not every kind of app: there are no customer accounts or payments. Publishing puts your site online here, on N-ATLAS.",
          )}
        </p>
      </Chapter>

      {/* 02 How it works */}
      <Chapter id="how" n="02" title={t("The workflow")} intro={t("From an idea in your language to an assistant people can use — in five steps.")}>
        <ol className="border-b border-stone-300">
          {FLOW.map((f, i) => (
            <li key={f.label} className="grid gap-2 border-t border-stone-300 py-5 sm:grid-cols-[4rem_12rem_1fr] sm:items-baseline">
              <span className="font-mono text-xs tracking-widest text-forge-600">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-serif text-2xl">{t(f.label)}</span>
              <span className="text-[15px] leading-relaxed text-stone-600">{t(f.blurb)}</span>
            </li>
          ))}
        </ol>
      </Chapter>

      {/* 03 Who does what */}
      <Chapter n="03" title={t("What is N-ATLAS?")}>
        <p className="max-w-2xl font-serif text-xl leading-relaxed text-stone-700">
          {t(
            "N-ATLAS is an open, Nigeria-focused large language model that understands Nigerian English, Yoruba, Hausa, and Igbo along with local context. It's great for some tasks and still learning others — so Launchpad helps you discover where N-ATLAS works for your application and test it before you deploy. Different models have different strengths; this tool helps you find N-ATLAS's.",
          )}
        </p>
        <div className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div className="border-t border-stone-300 pt-5">
            <div className="font-serif text-xl">{t("Groq does the thinking")}</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">{t("It writes your site and sets up its plugins, decides each answer from your facts only, and helps you along the way.")}</p>
          </div>
          <div className="border-t border-stone-300 pt-5">
            <div className="font-serif text-xl">{t("N-ATLAS speaks your language")}</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">{t("It understands you in Pidgin, Yoruba, Hausa or Igbo, puts everything into your language — and it's the model your assistant runs on.")}</p>
          </div>
        </div>
      </Chapter>

      {/* 04 For developers */}
      <Chapter n="04" title={t("Built for developers")}>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {DEV_FEATURES.map((f) => (
            <div key={f.title} className="border-t border-stone-300 pt-5">
              <div className="font-serif text-lg">{t(f.title)}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{t(f.body)}</p>
            </div>
          ))}
        </div>
      </Chapter>

      {/* Closing */}
      <section className="border-t border-stone-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-6 py-20">
          <div>
            <h2 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              {t("Ready to build in your language?")}
            </h2>
            <p className="mt-3 max-w-xl text-stone-600">{t("Start with one sentence about your idea. Launchpad takes it from there.")}</p>
          </div>
          <button onClick={newProject} className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-3.5 text-sm font-medium tracking-wide text-paper hover:opacity-90">
            {t("Start Building →").replace(/\s*→\s*$/, "")}
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

/** A numbered chapter: number and title on the left, content on the right, a hairline above. */
function Chapter({ id, n, title, intro, children }: { id?: string; n: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-stone-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[16rem_1fr] md:gap-14 md:py-24">
        <div>
          <div className="font-mono text-xs tracking-widest text-forge-600">{n}</div>
          <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight">{title}</h2>
          {intro && <p className="mt-3 text-sm leading-relaxed text-stone-500">{intro}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/** A glimpse of the product: a site it built, and a customer chatting in their language. */
function HeroPreview({ language }: { language: LangCode }) {
  const t = useT();
  const s = SAMPLE[language] ?? SAMPLE.en;
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#fbf8f1] shadow-[0_30px_60px_-30px_rgba(28,25,23,0.35)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <span className="flex items-center gap-2 font-serif text-base">
            <span className="h-1.5 w-1.5 rounded-full bg-forge-500" /> Kano Grains
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400">Home · Prices · FAQ</span>
        </div>
        <div className="px-5 pb-4 pt-6">
          <div className="font-serif text-3xl leading-tight tracking-tight">
            Fresh grain, <em className="italic text-forge-600">fair prices.</em>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {[
              ["Rice · 50kg", "₦82,000"],
              ["Maize · 50kg", "₦45,000"],
            ].map(([item, price]) => (
              <div key={item} className="flex items-baseline gap-2">
                <span className="font-serif">{item}</span>
                <span className="mb-1 flex-1 border-b border-dotted border-stone-400/60" />
                <span className="font-medium tabular-nums text-forge-600">{price}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2.5 border-t border-stone-200 bg-white/60 px-5 py-4 text-[13px]">
          <div className="text-[9px] uppercase tracking-[0.2em] text-stone-400">
            {t("Your assistant")} · {s.tag}
          </div>
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 leading-relaxed text-paper">{s.you}</p>
          </div>
          <div className="flex justify-start">
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-3.5 py-2 leading-relaxed text-stone-800">{s.natlas}</p>
          </div>
          <div className="flex items-center gap-1.5 pt-1 text-[10px] uppercase tracking-[0.18em] text-forge-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forge-500" />
            {t("Live")} · kano-grains.vercel.app
          </div>
        </div>
      </div>
    </div>
  );
}
