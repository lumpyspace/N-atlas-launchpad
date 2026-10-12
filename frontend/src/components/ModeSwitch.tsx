import { useT } from "../i18n";
import { useWorkspace, type Mode } from "../state/ProjectContext";

/** Simple (plain words, only what a first-timer needs) or Developer (every tool). */
export function ModeSwitch({ className = "" }: { className?: string }) {
  const { mode, setMode } = useWorkspace();
  const t = useT();
  const options: [Mode, string, string][] = [
    ["simple", t("Simple"), t("Plain words and only the steps a first-timer needs")],
    ["developer", t("Developer"), t("Every tool: instructions, test scores, security runs, comparisons, code and SDK")],
  ];
  return (
    <div className={`inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs ${className}`} role="radiogroup" aria-label={t("Mode")}>
      {options.map(([value, label, title]) => (
        <button
          key={value}
          role="radio"
          aria-checked={mode === value}
          title={title}
          onClick={() => setMode(value)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            mode === value ? "bg-white text-forge-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
