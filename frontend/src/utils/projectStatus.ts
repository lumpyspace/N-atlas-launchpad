/**
 * Where a project stands in each stage — used by the workspace sidebar and the
 * My projects cards, so both always agree.
 */

import { plural, translate, type T } from "../i18n";
import type { ProjectState, Step } from "../state/ProjectContext";

const EN: T = (text, vars) => translate("en", text, vars);

export type StageKey = "design" | "build" | "prompt" | "knowledge" | "test" | "ship";

export interface StageStatus {
  key: StageKey;
  label: string;
  /** The step this stage opens on. */
  step: Step;
  /** Steps that belong to this stage (for highlighting). */
  steps: Step[];
  done: boolean;
  /** False until there's a blueprint to build, test or ship. */
  available: boolean;
  /** One short line, e.g. "3 test cases · 2 passing". */
  detail: string;
}

const SLOTS_TOTAL = 8;

export function stages(p: ProjectState, t: T = EN): StageStatus[] {
  const built = !!p.blueprint;
  const answered = Object.keys(p.design.answers).filter((k) => k !== "notes").length;
  const tests = p.savedTestCases.length;
  const lastRun = [p.testRun, p.evalResult]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
  const sec = p.securityResult;

  return [
    {
      key: "design",
      label: t("Design"),
      step: "describe",
      steps: ["describe"],
      done: built || answered > 0,
      available: true,
      detail: answered
        ? t("{n} of {total} questions answered", { n: answered, total: SLOTS_TOTAL })
        : built
          ? t("Described in one sentence")
          : t("Talk your idea through"),
    },
    {
      key: "build",
      label: t("Build guide"),
      step: "blueprint",
      steps: ["blueprint"],
      done: built,
      available: built,
      detail: built ? t(p.blueprint!.buildPlan?.useCase?.label ?? "Blueprint ready") : t("Design your app first"),
    },
    {
      key: "prompt",
      label: t("Prompt"),
      step: "prompt",
      steps: ["prompt"],
      done: built && (p.promptVersions?.length ?? 0) > 0,
      available: built,
      detail: !built
        ? t("Design your app first")
        : p.promptVersions?.length
          ? plural(t, p.promptVersions.length, "{n} saved version", "{n} saved versions") +
            (p.systemPrompt !== p.promptVersions[0].text ? " · " + t("unsaved edits") : "")
          : p.systemPrompt !== p.blueprint!.systemPrompt
            ? t("Edited · not saved as a version")
            : t("Check and refine the generated prompt"),
    },
    {
      key: "knowledge",
      label: t("Knowledge"),
      step: "knowledge",
      steps: ["knowledge"],
      done: (p.knowledge?.length ?? 0) > 0,
      available: built,
      detail: !built
        ? t("Design your app first")
        : p.knowledge?.length
          ? plural(t, p.knowledge.length, "{n} document", "{n} documents") +
            " · " +
            plural(t, p.knowledge.reduce((s, d) => s + d.chunks.length, 0), "{n} passage", "{n} passages")
          : p.blueprint!.buildPlan?.knowledge?.needed
            ? t("Your app needs facts — add documents")
            : t("Optional: documents to answer from"),
    },
    {
      key: "test",
      label: t("Test"),
      step: "playground",
      steps: ["playground", "evaluate", "compare", "secure", "improve"],
      done: tests > 0 && !!lastRun && !!sec && !sec.partial,
      available: built,
      detail: tests
        ? plural(t, tests, "{n} test case", "{n} test cases") +
          " · " +
          (lastRun
            ? t("{passed}/{total} passing", { passed: lastRun.summary.passed, total: lastRun.summary.total })
            : t("not run yet")) +
          (sec ? " · " + t("Security score {score}", { score: sec.summary.score }) : "")
        : t("Try it and save test cases"),
    },
    {
      key: "ship",
      label: t("Ship"),
      step: "export",
      steps: ["export"],
      done: !!p.exportedAt,
      available: built,
      detail: p.exportedAt ? t("Downloaded {when}", { when: timeAgo(p.exportedAt, t) }) : t("Get your code, tests and CI"),
    },
  ];
}

/** The most useful thing to do next, in plain words. */
export function nextStep(p: ProjectState, t: T = EN): { step: Step; text: string } | null {
  const s = stages(p, t);
  const byKey = Object.fromEntries(s.map((x) => [x.key, x])) as Record<StageKey, StageStatus>;
  if (!byKey.build.done) {
    return { step: "describe", text: p.design.messages.length ? t("Keep talking it through, then press Build it.") : t("Describe your idea to start.") };
  }
  if (!p.savedTestCases.length) return { step: "playground", text: t("Try your app and save a few good and bad answers as test cases.") };
  if (!byKey.test.done) return { step: "evaluate", text: t("Run your test cases to get a baseline.") };
  const sec = p.securityResult;
  if (!sec || sec.partial) return { step: "secure", text: t("Run the security tests before you ship.") };
  if (!byKey.ship.done) return { step: "export", text: t("Download your starter project, tests and CI.") };
  return null;
}

export function timeAgo(iso: string, t: T = EN): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? t("yesterday") : t("{n} days ago", { n: d });
}
