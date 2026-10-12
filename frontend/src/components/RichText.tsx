import { useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { CheckIcon, CopyIcon } from "../ui/icons";

/**
 * A chat answer with commands in it: ```code blocks``` (with a copy button),
 * `inline code` and **bold**. Everything else keeps its line breaks.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/([ \t]*```[\w-]*\n?[\s\S]*?```)/g);
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const block = part.match(/^[ \t]*```([\w-]*)\n?([\s\S]*?)```$/);
        if (block) return <CodeBlock key={i} lang={block[1]} code={dedent(block[2])} />;
        return part.trim() ? <Prose key={i} text={part.replace(/^\n+|\n+$/g, "")} /> : null;
      })}
    </div>
  );
}

/** Code inside a list item arrives indented: drop the shared indent. */
function dedent(code: string): string {
  const lines = code.replace(/\s+$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
}

/** Headings, dividers and paragraphs; line breaks kept. */
function Prose({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.join("").trim()) out.push(<p key={out.length} className="whitespace-pre-wrap">{inline(para.join("\n").replace(/^\n+|\n+$/g, ""))}</p>);
    para = [];
  };
  for (const line of text.split("\n")) {
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
    if (heading) {
      flush();
      out.push(<p key={out.length} className="pt-1 font-semibold text-ink">{inline(heading[1])}</p>);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push(<hr key={out.length} className="border-slate-200" />);
    } else {
      para.push(line.replace(/^(\s*)\* /, "$1• "));
    }
  }
  flush();
  return <>{out}</>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g).map((s, i) => {
    if (s.startsWith("`") && s.endsWith("`") && s.length > 2) {
      return (
        <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
          {s.slice(1, -1)}
        </code>
      );
    }
    if (s.startsWith("**") && s.endsWith("**") && s.length > 4) return <strong key={i}>{s.slice(2, -2)}</strong>;
    const link = s.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="font-medium text-forge-700 underline">
          {link[1]}
        </a>
      );
    }
    return s;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  }
  return (
    <div className="group relative overflow-hidden rounded-lg bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">
        <span>{lang || "code"}</span>
        <button onClick={copy} className="inline-flex items-center gap-1 normal-case tracking-normal text-slate-300 hover:text-white">
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
