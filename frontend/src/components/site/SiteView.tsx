import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PublicSite, Section, SiteAnswer, SiteTurn, ThemeId } from "../../api";
import { isLangCode, translate, type LangCode } from "../../i18n";
import { ChatIcon, SendIcon, XIcon } from "../../ui/icons";
import { Spinner } from "../../ui";
import { RichText } from "../RichText";

/** A theme: the site's colours and shape (the accent is the owner's choice). */
const THEMES: Record<ThemeId, { bg: string; surface: string; text: string; muted: string; line: string; heroText: string; radius: string; heroStyle: (accent: string) => CSSProperties }> = {
  market: {
    bg: "#f6faf7",
    surface: "#ffffff",
    text: "#10231a",
    muted: "#5b6b63",
    line: "#e3ebe6",
    heroText: "#ffffff",
    radius: "16px",
    heroStyle: (a) => ({ background: `linear-gradient(135deg, ${a}, ${shade(a, -35)})` }),
  },
  clean: {
    bg: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    muted: "#64748b",
    line: "#e2e8f0",
    heroText: "#0f172a",
    radius: "10px",
    heroStyle: (a) => ({ background: `linear-gradient(180deg, ${shade(a, 88)}, #ffffff)`, borderBottom: `1px solid #e2e8f0` }),
  },
  warm: {
    bg: "#fffaf3",
    surface: "#ffffff",
    text: "#2b1d0e",
    muted: "#7a6650",
    line: "#f1e4d3",
    heroText: "#ffffff",
    radius: "22px",
    heroStyle: (a) => ({ background: `radial-gradient(circle at 20% 10%, ${shade(a, 25)}, ${a} 55%, ${shade(a, -30)})` }),
  },
  night: {
    bg: "#0b1220",
    surface: "#111a2e",
    text: "#e5e7eb",
    muted: "#94a3b8",
    line: "#1f2a44",
    heroText: "#ffffff",
    radius: "14px",
    heroStyle: (a) => ({ background: `linear-gradient(135deg, #0b1220, ${shade(a, -55)} 60%, ${shade(a, -25)})` }),
  },
};

/** Lighten (+) or darken (−) a #rrggbb colour by a percentage. */
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(pct >= 0 ? c + (255 - c) * (pct / 100) : c * (1 + pct / 100));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

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
  site,
  page: pageSlug,
  onNavigate,
  chat,
  contained = false,
  showBlanks = false,
}: {
  site: PublicSite;
  page: string;
  onNavigate: (slug: string) => void;
  chat: (history: SiteTurn[], sent: string[]) => Promise<SiteAnswer>;
  contained?: boolean;
  showBlanks?: boolean;
}) {
  const theme = THEMES[site.theme.id] ?? THEMES.market;
  const accent = site.theme.accent;
  const lang: LangCode = isLangCode(site.language) ? site.language : "en";
  const t = (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars);
  const page = site.pages.find((p) => p.slug === pageSlug) ?? site.pages[0];
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
    "--s-radius": theme.radius,
  } as CSSProperties;

  const openChat = (first?: string) => {
    setOpener(first ?? null);
    setChatOpen(true);
  };

  const sectionView = (s: Section, i: number) => {
    switch (s.type) {
      case "hero":
        return (
          <section key={i} style={theme.heroStyle(accent)} className="px-6 py-14 sm:py-20">
            <div className="mx-auto max-w-3xl text-center" style={{ color: theme.heroText }}>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                <Blanks text={s.heading} show={showBlanks} />
              </h1>
              {s.text && (
                <p className="mx-auto mt-4 max-w-xl whitespace-pre-wrap text-base opacity-90 sm:text-lg">
                  <Blanks text={s.text} show={showBlanks} />
                </p>
              )}
              {s.button !== "none" && (s.button !== "whatsapp" || wa) && (s.button === "whatsapp" || site.assistant) && (
                <button
                  onClick={() =>
                    s.button === "whatsapp" ? window.open(`https://wa.me/${wa}`, "_blank") : openChat(s.button === "order" ? t("I'd like to place an order.") : undefined)
                  }
                  className="mt-7 inline-flex items-center gap-2 px-6 py-3 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ background: theme.heroText === "#ffffff" ? "#ffffff" : accent, color: theme.heroText === "#ffffff" ? accent : "#ffffff", borderRadius: "999px" }}
                >
                  <ChatIcon size={16} />
                  {s.button === "order" ? t("Order now") : s.button === "whatsapp" ? t("Chat on WhatsApp") : t("Ask us anything")}
                </button>
              )}
            </div>
          </section>
        );
      case "text":
        return (
          <section key={i} className="mx-auto max-w-3xl px-6 py-10">
            {s.heading && (
              <h2 className="text-2xl font-bold tracking-tight">
                <Blanks text={s.heading} show={showBlanks} />
              </h2>
            )}
            <p className="mt-3 whitespace-pre-wrap leading-relaxed" style={{ color: "var(--s-muted)" }}>
              <Blanks text={s.text} show={showBlanks} />
            </p>
          </section>
        );
      case "faq":
        return (
          <section key={i} className="mx-auto max-w-3xl px-6 py-10">
            {s.heading && <h2 className="text-2xl font-bold tracking-tight">{s.heading}</h2>}
            <div className="mt-4 space-y-2">
              {s.items.map((it, j) => (
                <details key={j} className="group border px-4 py-3" style={{ background: "var(--s-surface)", borderColor: "var(--s-line)", borderRadius: "var(--s-radius)" }}>
                  <summary className="cursor-pointer list-none font-semibold">
                    <Blanks text={it.q} show={showBlanks} />
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--s-muted)" }}>
                    <Blanks text={it.a} show={showBlanks} />
                  </p>
                </details>
              ))}
            </div>
          </section>
        );
      case "prices":
        if (!site.prices) return null;
        return (
          <section key={i} className="mx-auto max-w-3xl px-6 py-10">
            {s.heading && <h2 className="text-2xl font-bold tracking-tight">{s.heading}</h2>}
            <div className="mt-4 overflow-hidden border" style={{ background: "var(--s-surface)", borderColor: "var(--s-line)", borderRadius: "var(--s-radius)" }}>
              {site.prices.length === 0 && <p className="px-4 py-3 text-sm" style={{ color: "var(--s-muted)" }}>{t("Prices coming soon.")}</p>}
              {site.prices.map((it, j) => (
                <div key={j} className="flex items-baseline justify-between gap-4 border-t px-4 py-3 first:border-t-0" style={{ borderColor: "var(--s-line)" }}>
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-xs" style={{ color: "var(--s-muted)" }}>
                      {[it.unit, it.note].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0 font-bold" style={{ color: it.price == null ? "var(--s-muted)" : "var(--s-accent)" }}>
                    {it.price == null ? t("Ask us") : naira(it.price)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      case "contact":
        if (!site.contact) return null;
        return (
          <section key={i} className="mx-auto max-w-3xl px-6 py-10">
            {s.heading && <h2 className="text-2xl font-bold tracking-tight">{s.heading}</h2>}
            <div className="mt-4 flex flex-wrap gap-3">
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3 font-semibold text-white" style={{ background: "#25D366", borderRadius: "999px" }}>
                  <ChatIcon size={16} /> WhatsApp
                </a>
              )}
              {site.contact.phone && (
                <a href={`tel:${site.contact.phone}`} className="inline-flex items-center gap-2 border px-5 py-3 font-semibold" style={{ borderColor: "var(--s-line)", borderRadius: "999px" }}>
                  {site.contact.phone}
                </a>
              )}
              {!wa && !site.contact.phone && showBlanks && <span className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-800">{translate("en", "Add your WhatsApp or phone number in Plugins.")}</span>}
            </div>
            {site.contact.hours && (
              <p className="mt-3 text-sm" style={{ color: "var(--s-muted)" }}>
                {site.contact.hours}
              </p>
            )}
          </section>
        );
    }
  };

  return (
    <div style={{ ...vars, background: "var(--s-bg)", color: "var(--s-text)" }} className={`${contained ? "relative min-h-full" : "min-h-screen"} font-sans`}>
      <header className="sticky top-0 z-10 border-b backdrop-blur" style={{ borderColor: "var(--s-line)", background: `${theme.bg}e6` }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <button onClick={() => onNavigate("")} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: accent }}>
              {site.name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate font-bold">{site.name}</span>
          </button>
          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {site.pages
              .filter((p) => p.inMenu)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate(p.slug)}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors"
                  style={p.id === page.id ? { background: accent, color: "#fff" } : { color: "var(--s-muted)" }}
                >
                  {p.title}
                </button>
              ))}
          </nav>
        </div>
      </header>

      <main>{page.sections.map(sectionView)}</main>

      <footer className="mt-10 border-t px-6 py-8 text-center text-sm" style={{ borderColor: "var(--s-line)", color: "var(--s-muted)" }}>
        <div className="font-semibold" style={{ color: "var(--s-text)" }}>
          {site.name}
        </div>
        {site.tagline && <div className="mt-1">{site.tagline}</div>}
        <div className="mt-3 text-xs opacity-70">
          {t("Powered by N-ATLAS")} · <a href="/" className="hover:underline">N-ATLAS Launchpad</a>
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
          chat={chat}
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
        className={`${pos} bottom-5 right-5 z-20 inline-flex items-center gap-2 px-4 py-3 font-semibold text-white shadow-xl transition-transform hover:-translate-y-0.5`}
        style={{ background: "var(--s-accent)", borderRadius: "999px" }}
      >
        <ChatIcon size={18} /> {t("Ask us anything")}
      </button>
    );
  }
  return (
    <div
      className={`${pos} bottom-4 right-4 z-20 flex w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden border shadow-2xl`}
      style={{ background: "var(--s-surface)", borderColor: "var(--s-line)", borderRadius: "var(--s-radius)", height: contained ? "min(30rem, calc(100% - 2rem))" : "min(34rem, calc(100dvh - 2rem))" }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: "var(--s-accent)" }}>
        <div className="min-w-0">
          <div className="truncate font-semibold">{site.name}</div>
          <div className="text-[11px] opacity-80">{t("Replies in English, Pidgin, Yoruba, Hausa or Igbo")}</div>
        </div>
        <button onClick={onClose} aria-label={t("Close")} className="rounded p-1 hover:bg-white/15">
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
