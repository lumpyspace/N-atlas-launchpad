import { useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "../ui";
import { useT, type T } from "../i18n";

/** Live state of a streaming test run. */
export interface LiveRun<R> {
  label: string;
  total: number | null;
  results: R[];
  startedAt: number;
}

function formatDuration(ms: number, t: T): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t("{s}s", { s });
  const m = Math.floor(s / 60);
  return t("{m}m {s}s", { m, s: String(s % 60).padStart(2, "0") });
}

/**
 * Progress bar + elapsed time + ETA + Stop for a streaming run. The ETA uses
 * the average time per completed case, so it settles after the first result.
 */
export function RunProgress<R>({ run, onStop }: { run: LiveRun<R>; onStop: () => void }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    // The Run buttons can be far above this card; bring the progress into view.
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => clearInterval(t);
  }, []);

  const done = run.results.length;
  const total = run.total ?? 0;
  const elapsed = now - run.startedAt;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const eta = done > 0 && total > done ? (elapsed / done) * (total - done) : null;

  return (
    <div ref={ref}>
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-3">
        <Spinner className="text-forge-500" />
        <div className="flex-1 text-sm">
          <div className="font-medium text-slate-700">
            {t(run.label)} — {total ? t("{done} of {total}", { done, total }) : t("starting…")}
          </div>
          <div className="text-xs text-slate-400">
            {t("{time} elapsed", { time: formatDuration(elapsed, t) })}
            {eta !== null && " · " + t("about {time} left", { time: formatDuration(eta, t) })}
            {done === 0 && total > 0 && " · " + t("the first reply can take a while if the model is cold")}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onStop}>
          ■ {t("Stop")}
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-forge-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
    </div>
  );
}
