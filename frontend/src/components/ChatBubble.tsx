import { useState } from "react";
import type { DesignMessage } from "../api";
import { useT } from "../i18n";
import { Spinner } from "../ui";
import { RichText } from "./RichText";

/**
 * One message in a helper chat (Go live guide, page helper): the person's
 * words (with N-ATLAS's English reading), or the answer with who thought it
 * and who wrote it, rich text, and "Show in English".
 */
export function ChatBubble({
  m,
  thinking,
  elapsed,
  compact = false,
}: {
  m: DesignMessage;
  thinking: boolean;
  elapsed: number;
  /** Smaller, for the side helper. */
  compact?: boolean;
}) {
  const t = useT();
  const [showEnglish, setShowEnglish] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-forge-500 px-4 py-2.5 text-sm text-white">
          <p className="whitespace-pre-wrap">{m.content}</p>
          {m.understood && (
            <p className="mt-1 border-t border-white/30 pt-1 text-[11px] italic text-white/80">
              {t("N-ATLAS understood: {text}", { text: m.understood })}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-forge-600">
          {m.voice ?? "N-ATLAS"}
          {m.brain && m.voice === "N-ATLAS" && (
            <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">· {t("thinking by {brain}", { brain: m.brain })}</span>
          )}
        </div>
        {m.content ? (
          <RichText text={m.content} />
        ) : thinking ? (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <Spinner className="h-3 w-3" /> {compact ? t("Thinking…") : t("Writing your steps…")} {elapsed > 5 && `${elapsed}s`}
          </span>
        ) : null}
        {m.english && m.content && m.english !== m.content && (
          <div className="mt-2 border-t border-slate-100 pt-1.5">
            <button onClick={() => setShowEnglish((s) => !s)} className="text-[11px] text-slate-400 hover:text-forge-600">
              {showEnglish ? t("Hide English") : t("Show in English")}
            </button>
            {showEnglish && (
              <div className="mt-1 text-xs text-slate-500">
                <RichText text={m.english} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

