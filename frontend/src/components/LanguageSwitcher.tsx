import { useEffect } from "react";
import { LANGUAGES, isLangCode, useT } from "../i18n";
import { useWorkspace } from "../state/ProjectContext";
import { GlobeIcon } from "../ui/icons";

/**
 * The language Launchpad's pages are shown in and N-ATLAS replies in. Inside a
 * project it is that project's language; elsewhere, the default for new projects.
 */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, workspace } = useWorkspace();
  const t = useT();

  useEffect(() => {
    document.documentElement.lang = language === "pid" ? "pcm" : language;
  }, [language]);

  const title =
    workspace.view === "project"
      ? t("This project's language: pages and N-ATLAS replies use it")
      : t("Language for pages and new projects");

  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500" title={title}>
      <GlobeIcon size={14} className="hidden text-slate-400 sm:block" />
      {!compact && <span className="hidden md:inline">{t("Language")}</span>}
      <select
        value={language}
        onChange={(e) => isLangCode(e.target.value) && setLanguage(e.target.value)}
        aria-label={title}
        className="rounded-md border border-slate-300 bg-white py-1 pl-2 pr-6 text-xs font-medium text-slate-700 focus:border-forge-500 focus:outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
            {!compact && l.native !== l.english ? ` (${l.english})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Big buttons for choosing a project's language when it starts. */
export function LanguagePicker({ onPick }: { onPick?: () => void }) {
  const { language, setLanguage } = useWorkspace();
  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => {
            setLanguage(l.code);
            onPick?.();
          }}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            language === l.code
              ? "border-forge-500 bg-forge-50 text-forge-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          {l.native}
          {l.native !== l.english && <span className="ml-1 text-xs font-normal text-slate-400">{l.english}</span>}
        </button>
      ))}
    </div>
  );
}
