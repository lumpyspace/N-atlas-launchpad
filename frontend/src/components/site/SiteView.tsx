import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PublicSite, Section, SiteAnswer, SiteTurn, ThemeId } from "../../api";
import { isLangCode, LANGUAGES, translate, type LangCode } from "../../i18n";
import { SendIcon, XIcon } from "../../ui/icons";
import { Spinner } from "../../ui";
import { RichText } from "../RichText";

/**
 * The site's palette. Every theme is editorial — serif headlines, white space,
 * hairline rules, the accent used sparingly; they differ in paper and ink.
 */
const THEMES: Record<ThemeId, { bg: string; surface: string; text: string; muted: string; line: string }> = {
  market: { bg: "#f7f5ef", surface: "#fffdf8", text: "#1b1a17", muted: "#6b675d", line: "#e2ddd0" },
  clean: { bg: "#ffffff", surface: "#fafafa", text: "#111111", muted: "#6b6b6b", line: "#e7e7e7" },
  warm: { bg: "#fbf3e8", surface: "#fffaf3", text: "#2a1d12", muted: "#806b55", line: "#eadbc6" },
  night: { bg: "#111110", surface: "#1a1a18", text: "#f2eee6", muted: "#a49f94", line: "#2d2c29" },
};

const SERIF = '"Fraunces", "Iowan Old Style", Georgia, serif';

const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;

interface Msg {
  role: "user" | "assistant";
  content: string;
  english?: string;
  saved?: boolean;
  order?: Record<string, string>;
}

/**
 * A published site, as visitors see it — also the live preview in the admin.
 * `contained`: inside the admin, the chat bubble stays within the preview.
 * `showBlanks`: highlight … the owner still has to fill in.
 */
export function SiteView({
  site: base,
  page: pageSlug,
  onNavigate,
  chat,
  contained = false,
  showBlanks = false,
  language,
}: {
  site: PublicSite;
  page: string;
  onNavigate: (slug: string) => void;
  chat: (history: SiteTurn[], sent: string[], lang: string) => Promise<SiteAnswer>;
  contained?: boolean;
  showBlanks?: boolean;
  /** Show this language (the admin previewing a translation); otherwise the visitor picks. */
  language?: string;
}) {
  // The visitor's language: the site's own, or one of its extra languages (remembered per site).
  const memoryKey = `natlas-site-lang:${base.slug || base.name}`;
  const offered = [base.language, ...(base.languages ?? [])];
  const [picked, setChosen] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(memoryKey);
      if (saved && offered.includes(saved)) return saved;
    } catch {
      /* storage unavailable */
    }
    return base.language;
  });
  const pick = (l: string) => {
    setChosen(l);
    try {
      localStorage.setItem(memoryKey, l);
    } catch {
      /* storage unavailable */
    }
  };
  const chosen = language ?? picked;
  const tr = chosen !== base.language ? base.translations?.[chosen] : undefined;
  const site = tr ? { ...base, tagline: tr.tagline, greeting: tr.greeting, pages: tr.pages, posts: tr.posts } : base;
  const theme = THEMES[site.theme.id] ?? THEMES.market;
  const accent = site.theme.accent;
  const lang: LangCode = isLangCode(tr ? chosen : site.language) ? ((tr ? chosen : site.language) as LangCode) : "en";
  const t = (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars);
  // "blog/<slug>" is a post; anything else is a page.
  const postSlug = pageSlug.startsWith("blog/") ? pageSlug.slice(5) : null;
  const post = postSlug ? site.posts.find((p) => p.slug === postSlug) : undefined;
  const page = site.pages.find((p) => p.slug === pageSlug) ?? site.pages[0];
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang === "en" ? "en-NG" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const [chatOpen, setChatOpen] = useState(false);
  const [opener, setOpener] = useState<string | null>(null);
  const wa = site.contact?.whatsapp.replace(/[^\d]/g, "");

  const vars = {
    "--s-bg": theme.bg,
    "--s-surface": theme.surface,
    "--s-text": theme.text,
    "--s-muted": theme.muted,
    "--s-line": theme.line,
    "--s-accent": accent,
    "--s-serif": SERIF,
  } as CSSProperties;
  const serif: CSSProperties = { fontFamily: "var(--s-serif)" };

  const openChat = (first?: string) => {
    setOpener(first ?? null);
    setChatOpen(true);
  };

  /** A headline whose last words are set in italic accent — the editorial touch. */
  const Headline = ({ text }: { text: string }) => {
    const words = text.split(/\s+/);
    if (showBlanks || words.length < 3) return <Blanks text={text} show={showBlanks} />;
    const cut = words.length - Math.min(2, Math.floor(words.length / 3) || 1);
    return (
      <>
        {words.slice(0, cut).join(" ")}{" "}
        <em className="italic" style={{ color: "var(--s-accent)" }}>
          {words.slice(cut).join(" ")}
        </em>
      </>
    );
  };

  /** A numbered section (01, 02… — banners aren't counted): number and heading on the left, content on the right. */
  const block = (i: number, heading: string, children: ReactNode) => {
    const num = String(page.sections.slice(0, i).filter((x) => x.type !== "hero").length + 1).padStart(2, "0");
    return (
      <section key={i} className="border-t" style={{ borderColor: "var(--s-line)" }}>
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-14 md:grid-cols-[15rem_1fr] md:gap-12 md:py-20">
          <div>
            <div className="font-mono text-xs tracking-widest" style={{ color: "var(--s-accent)" }}>
              {num}
            </div>
            {heading && (
              <h2 className="mt-3 text-3xl leading-tight tracking-tight" style={serif}>
                <Blanks text={heading} show={showBlanks} />
              </h2>
            )}
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </section>
    );
  };

  const button = (s: Extract<Section, { type: "hero" }>) =>
    s.button !== "none" &&
    (s.button !== "whatsapp" || wa) &&
    (s.button === "whatsapp" || site.assistant) && (
      <button
        onClick={() => (s.button === "whatsapp" ? window.open(`https://wa.me/${wa}`, "_blank") : openChat(s.button === "order" ? t("I'd like to place an order.") : undefined))}
        className="group inline-flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium tracking-wide transition-opacity hover:opacity-90"
        style={{ background: "var(--s-text)", color: "var(--s-bg)" }}
      >
        {s.button === "order" ? t("Order now") : s.button === "whatsapp" ? t("Chat on WhatsApp") : t("Ask us anything")}
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    );

  const sectionView = (s: Section, i: number) => {
    switch (s.type) {
      case "hero":
        return (
          <section key={i} className="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pb-24 sm:pt-24">
            {site.tagline && i === 0 && (
              <div className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--s-muted)" }}>
                <span className="h-px w-8" style={{ background: "var(--s-accent)" }} />
                {site.tagline}
              </div>
            )}
            <h1 className="max-w-4xl text-5xl leading-[1.02] tracking-tight sm:text-7xl" style={{ ...serif, fontWeight: 400 }}>
              <Headline text={s.heading} />
            </h1>
            {s.text && (
              <p className="mt-8 max-w-xl whitespace-pre-wrap text-lg leading-relaxed" style={{ color: "var(--s-muted)" }}>
                <Blanks text={s.text} show={showBlanks} />
              </p>
            )}
            <div className="mt-10">{button(s)}</div>
          </section>
        );
      case "text":
        return (
          block(i, s.heading, <>
            <p className="max-w-2xl whitespace-pre-wrap text-lg leading-relaxed">
              <Blanks text={s.text} show={showBlanks} />
            </p>
          </>)
        );
      case "faq":
        return (
          block(i, s.heading, <>
            <div className="border-b" style={{ borderColor: "var(--s-line)" }}>
              {s.items.map((it, j) => (
                <details key={j} className="group border-t py-5" style={{ borderColor: "var(--s-line)" }}>
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 text-xl" style={serif}>
                    <span>
                      <Blanks text={it.q} show={showBlanks} />
                    </span>
                    <span className="shrink-0 font-sans text-lg transition-transform group-open:rotate-45" style={{ color: "var(--s-accent)" }}>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl whitespace-pre-wrap leading-relaxed" style={{ color: "var(--s-muted)" }}>
                    <Blanks text={it.a} show={showBlanks} />
                  </p>
                </details>
              ))}
            </div>
          </>)
        );
      case "prices":
        if (!site.prices) return null;
        return (
          block(i, s.heading, <>
            {site.prices.length === 0 && <p style={{ color: "var(--s-muted)" }}>{t("Prices coming soon.")}</p>}
            <ul className="max-w-2xl space-y-5">
              {site.prices.map((it, j) => (
                <li key={j}>
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl" style={serif}>
                      {it.name}
                    </span>
                    <span className="mb-1 flex-1 border-b border-dotted" style={{ borderColor: "var(--s-muted)", opacity: 0.5 }} />
                    <span className="font-medium tabular-nums" style={{ color: it.price == null ? "var(--s-muted)" : "var(--s-accent)" }}>
                      {it.price == null ? t("Ask us") : naira(it.price)}
                    </span>
                  </div>
                  {(it.unit || it.note) && (
                    <div className="mt-0.5 text-sm" style={{ color: "var(--s-muted)" }}>
                      {[it.unit, it.note].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>)
        );
      case "posts": {
        const latest = site.posts.slice(0, s.count);
        if (!latest.length)
          return showBlanks ? (
            block(i, s.heading, <>
              <p style={{ color: "var(--s-muted)" }}>{translate("en", "Your published posts will appear here.")}</p>
            </>)
          ) : null;
        return (
          block(i, s.heading, <>
            <div className="border-b" style={{ borderColor: "var(--s-line)" }}>
              {latest.map((p) => (
                <button key={p.id} onClick={() => onNavigate(`blog/${p.slug}`)} className="group grid w-full gap-4 border-t py-6 text-left sm:grid-cols-[1fr_8rem]" style={{ borderColor: "var(--s-line)" }}>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--s-muted)" }}>
                      {fmtDate(p.date)}
                    </div>
                    <div className="mt-2 text-2xl leading-snug decoration-1 underline-offset-4 group-hover:underline" style={serif}>
                      {p.title}
                    </div>
                    <p className="mt-2 line-clamp-2 max-w-2xl" style={{ color: "var(--s-muted)" }}>
                      {p.body.split(/\n\s*\n/)[0]}
                    </p>
                  </div>
                  {p.cover && <img src={p.cover} alt="" className="hidden h-24 w-32 object-cover sm:block" />}
                </button>
              ))}
            </div>
          </>)
        );
      }
      case "contact":
        if (!site.contact) return null;
        return (
          block(i, s.heading, <>
            <div className="space-y-3 text-2xl sm:text-3xl" style={serif}>
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="block decoration-1 underline-offset-8 hover:underline">
                  WhatsApp <span style={{ color: "var(--s-accent)" }}>→</span> {site.contact.whatsapp}
                </a>
              )}
              {site.contact.phone && (
                <a href={`tel:${site.contact.phone}`} className="block decoration-1 underline-offset-8 hover:underline">
                  {site.contact.phone}
                </a>
              )}
            </div>
            {!wa && !site.contact.phone && showBlanks && <span className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-800">{translate("en", "Add your WhatsApp or phone number in Plugins.")}</span>}
            {site.contact.hours && (
              <p className="mt-4 text-sm uppercase tracking-[0.18em]" style={{ color: "var(--s-muted)" }}>
                {site.contact.hours}
              </p>
            )}
          </>)
        );
    }
  };

  return (
    <div style={{ ...vars, background: "var(--s-bg)", color: "var(--s-text)" }} className={`${contained ? "relative min-h-full" : "min-h-screen"} font-sans antialiased`}>
      <header className="sticky top-0 z-10 border-b backdrop-blur" style={{ borderColor: "var(--s-line)", background: `${theme.bg}eb` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <button onClick={() => onNavigate("")} className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
            <span className="truncate text-xl tracking-tight" style={serif}>
              {site.name}
            </span>
          </button>
          <nav className="flex items-center gap-5 overflow-x-auto text-[11px] uppercase tracking-[0.18em]">
            {site.pages
              .filter((p) => p.inMenu)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate(p.slug)}
                  className="whitespace-nowrap border-b pb-0.5 transition-colors"
                  style={p.id === page.id && !postSlug ? { borderColor: accent, color: "var(--s-text)" } : { borderColor: "transparent", color: "var(--s-muted)" }}
                >
                  {p.title}
                </button>
              ))}
            {offered.length > 1 && (
              <select
                value={chosen}
                onChange={(e) => pick(e.target.value)}
                aria-label="Language"
                className="cursor-pointer border-0 border-b bg-transparent pb-0.5 text-[11px] uppercase tracking-[0.18em] focus:outline-none"
                style={{ borderColor: "var(--s-line)", color: "var(--s-text)" }}
              >
                {offered.map((l) => (
                  <option key={l} value={l} style={{ color: "#111", textTransform: "none" }}>
                    {LANGUAGES.find((x) => x.code === l)?.native ?? l}
                  </option>
                ))}
              </select>
            )}
          </nav>
        </div>
      </header>

      <main>
        {postSlug ? (
          post ? (
            <article className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
              <button onClick={() => onNavigate("")} className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--s-muted)" }}>
                ← {site.name}
              </button>
              <div className="mt-10 text-xs uppercase tracking-[0.18em]" style={{ color: "var(--s-accent)" }}>
                {fmtDate(post.date)}
                {post.author ? ` · ${post.author}` : ""}
              </div>
              <h1 className="mt-4 text-4xl leading-[1.08] tracking-tight sm:text-6xl" style={{ ...serif, fontWeight: 400 }}>
                {post.title}
              </h1>
              {post.cover && <img src={post.cover} alt="" className="mt-10 w-full object-cover" style={{ maxHeight: "28rem" }} />}
              <div className="mt-10 space-y-6 text-lg leading-relaxed">
                {post.body.split(/\n\s*\n/).map((para, j) => (
                  <p
                    key={j}
                    className={`whitespace-pre-wrap ${j === 0 ? "text-xl first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-serif first-letter:text-7xl first-letter:leading-[0.8]" : ""}`}
                  >
                    <Blanks text={para} show={showBlanks} />
                  </p>
                ))}
              </div>
            </article>
          ) : (
            <section className="mx-auto max-w-2xl px-6 py-24 text-center" style={{ color: "var(--s-muted)" }}>
              {t("This post isn't here any more.")}
            </section>
          )
        ) : (
          page.sections.map(sectionView)
        )}
      </main>

      <footer className="border-t" style={{ borderColor: "var(--s-line)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 py-12">
          <div>
            <div className="text-2xl tracking-tight" style={serif}>
              {site.name}
            </div>
            {site.tagline && (
              <div className="mt-1 max-w-sm text-sm" style={{ color: "var(--s-muted)" }}>
                {site.tagline}
              </div>
            )}
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--s-muted)" }}>
            {t("Powered by N-ATLAS and Groq")} · <a href="/" className="hover:underline">N-ATLAS Launchpad</a>
          </div>
        </div>
      </footer>

      {site.assistant && (
        <ChatBubble
          site={site}
          open={chatOpen}
          opener={opener}
          onOpen={() => openChat()}
          onClose={() => setChatOpen(false)}
          onOpenerUsed={() => setOpener(null)}
          chat={(h, sent) => chat(h, sent, chosen)}
          contained={contained}
          t={t}
        />
      )}
    </div>
  );
}

/** Text with the owner's blanks (…) highlighted in the admin preview. */
function Blanks({ text, show }: { text: string; show: boolean }) {
  if (!show || !/…|\.\.\.|_{3,}/.test(text)) return <>{text}</>;
  return (
    <>
      {text.split(/(…|\.\.\.|_{3,})/).map((part, i) =>
        /^(…|\.\.\.|_{3,})$/.test(part) ? (
          <mark key={i} className="rounded bg-amber-200 px-1 text-amber-900">
            …
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ChatBubble({
  site,
  open,
  opener,
  onOpen,
  onClose,
  onOpenerUsed,
  chat,
  contained,
  t,
}: {
  site: PublicSite;
  open: boolean;
  opener: string | null;
  onOpen: () => void;
  onClose: () => void;
  onOpenerUsed: () => void;
  chat: (history: SiteTurn[], sent: string[]) => Promise<SiteAnswer>;
  contained: boolean;
  t: (text: string) => string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pos = contained ? "absolute" : "fixed";

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  async function send(text: string) {
    const words = text.trim();
    if (!words || busy) return;
    setDraft("");
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: words }];
    setMessages(next);
    setBusy(true);
    scrollDown();
    try {
      const history = next.map((m) => ({ role: m.role, content: m.role === "assistant" ? m.english ?? m.content : m.content }));
      const a = await chat(history, sent);
      if (a.orderKey && a.order) setSent((s) => [...s, a.orderKey!]);
      setMessages([...next, { role: "assistant", content: a.reply, english: a.english, saved: !!a.order?.saved, order: a.order?.fields }]);
    } catch (e) {
      setMessages(next);
      setError(e instanceof Error ? e.message : t("Something went wrong — please try again."));
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  // "Order now" opens the chat with the visitor's first words already sent.
  useEffect(() => {
    if (open && opener) {
      onOpenerUsed();
      send(opener);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opener]);

  if (!open) {
    return (
      <button
        onClick={onOpen}
        className={`${pos} bottom-5 right-5 z-20 inline-flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-medium shadow-xl transition-transform hover:-translate-y-0.5`}
        style={{ background: "var(--s-text)", color: "var(--s-bg)" }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--s-accent)" }} /> {t("Ask us anything")}
      </button>
    );
  }
  return (
    <div
      className={`${pos} bottom-4 right-4 z-20 flex w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden border shadow-2xl`}
      style={{ background: "var(--s-surface)", borderColor: "var(--s-line)", borderRadius: "14px", height: contained ? "min(30rem, calc(100% - 2rem))" : "min(34rem, calc(100dvh - 2rem))" }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--s-line)" }}>
        <div className="min-w-0">
          <div className="truncate text-lg" style={{ fontFamily: "var(--s-serif)" }}>
            {site.name}
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--s-muted)" }}>
            {t("Replies in English, Pidgin, Yoruba, Hausa or Igbo")}
          </div>
        </div>
        <button onClick={onClose} aria-label={t("Close")} className="rounded p-1 opacity-60 hover:opacity-100">
          <XIcon size={16} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 text-sm">
        <Bubble role="assistant">{site.greeting}</Bubble>
        {messages.map((m, i) => (
          <div key={i}>
            <Bubble role={m.role}>{m.role === "assistant" ? <RichText text={m.content} /> : m.content}</Bubble>
            {m.saved && <p className="ml-2 mt-1 text-xs font-medium" style={{ color: "var(--s-accent)" }}>✓ {t("Sent to the owner")}</p>}
            {!m.saved && m.order && (
              <div className="ml-2 mt-1 rounded-lg border border-dashed px-2 py-1 text-[11px]" style={{ borderColor: "var(--s-accent)", color: "var(--s-muted)" }}>
                {translate("en", "Preview: once published, this goes to your inbox")} — {Object.values(m.order).join(" · ")}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <Bubble role="assistant">
            <span className="inline-flex items-center gap-2 opacity-60">
              <Spinner className="h-3 w-3" /> {t("Thinking…")}
            </span>
          </Bubble>
        )}
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 border-t p-2.5"
        style={{ borderColor: "var(--s-line)" }}
      >
        <input
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Type your message…")}
          aria-label={t("Type your message…")}
          className="min-w-0 flex-1 rounded-full border bg-transparent px-4 py-2 text-sm focus:outline-none"
          style={{ borderColor: "var(--s-line)" }}
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label={t("Send")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ background: "var(--s-accent)" }}>
          <SendIcon size={15} />
        </button>
      </form>
      <p className="px-3 pb-2 text-center text-[10px]" style={{ color: "var(--s-muted)" }}>
        {t("Answers are written by AI (N-ATLAS and Groq) — check prices and details with the business.")}
      </p>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[85%] whitespace-pre-wrap px-3.5 py-2 leading-relaxed"
        style={
          role === "user"
            ? { background: "var(--s-accent)", color: "#fff", borderRadius: "16px 16px 4px 16px" }
            : { background: "var(--s-bg)", color: "var(--s-text)", borderRadius: "16px 16px 16px 4px", border: "1px solid var(--s-line)" }
        }
      >
        {children}
      </div>
    </div>
  );
}
