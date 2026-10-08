import { STEPS, stepIndex, useProject } from "../state/ProjectContext";

/**
 * Top progress nav: 01 Describe … 07 Export. The developer always knows where
 * they are. Completed/current steps are clickable (go back); forward moves
 * happen via each screen's Continue button so prerequisites are respected.
 */
export default function Stepper() {
  const { state, dispatch } = useProject();
  const current = stepIndex(state.step);

  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((s, i) => {
        const status =
          i < current ? "done" : i === current ? "active" : "upcoming";
        const clickable = i <= current;
        return (
          <button
            key={s.key}
            disabled={!clickable}
            onClick={() => clickable && dispatch({ type: "setStep", step: s.key })}
            className={[
              "group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              status === "active"
                ? "border-forge-500 bg-forge-50 text-forge-700"
                : status === "done"
                  ? "border-slate-200 bg-white text-slate-600 hover:border-forge-400"
                  : "border-slate-200 bg-white text-slate-400",
              clickable ? "cursor-pointer" : "cursor-default",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                status === "active"
                  ? "bg-forge-500 text-white"
                  : status === "done"
                    ? "bg-forge-100 text-forge-700"
                    : "bg-slate-100 text-slate-400",
              ].join(" ")}
            >
              {status === "done" ? "✓" : String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-medium">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
