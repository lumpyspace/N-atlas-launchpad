/**
 * Where a project stands in each stage — used by the workspace sidebar and the
 * My projects cards, so both always agree.
 */

import type { ProjectState, Step } from "../state/ProjectContext";

export type StageKey = "design" | "build" | "prompt" | "knowledge" | "test" | "secure" | "ship";

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

export function stages(p: ProjectState): StageStatus[] {
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
      label: "Design",
      step: "describe",
      steps: ["describe"],
      done: built || answered > 0,
      available: true,
      detail: answered
        ? `${answered} of ${SLOTS_TOTAL} questions answered`
        : built
          ? "Described in one sentence"
          : "Talk your idea through",
    },
    {
      key: "build",
      label: "Build guide",
      step: "blueprint",
      steps: ["blueprint"],
      done: built,
      available: built,
      detail: built ? p.blueprint!.buildPlan?.useCase?.label ?? "Blueprint ready" : "Design your app first",
    },
    {
      key: "prompt",
      label: "Prompt",
      step: "prompt",
      steps: ["prompt"],
      done: built && (p.promptVersions?.length ?? 0) > 0,
      available: built,
      detail: !built
        ? "Design your app first"
        : p.promptVersions?.length
          ? `${p.promptVersions.length} saved version${p.promptVersions.length === 1 ? "" : "s"}${p.systemPrompt !== p.promptVersions[0].text ? " · unsaved edits" : ""}`
          : p.systemPrompt !== p.blueprint!.systemPrompt
            ? "Edited · not saved as a version"
            : "Check and refine the generated prompt",
    },
    {
      key: "knowledge",
      label: "Knowledge",
      step: "knowledge",
      steps: ["knowledge"],
      done: (p.knowledge?.length ?? 0) > 0,
      available: built,
      detail: !built
        ? "Design your app first"
        : p.knowledge?.length
          ? `${p.knowledge.length} document${p.knowledge.length === 1 ? "" : "s"} · ${p.knowledge.reduce((s, d) => s + d.chunks.length, 0)} passages`
          : p.blueprint!.buildPlan?.knowledge?.needed
            ? "Your app needs facts — add documents"
            : "Optional: documents to answer from",
    },
    {
      key: "test",
      label: "Test",
      step: "playground",
      steps: ["playground", "evaluate", "compare"],
      done: tests > 0 && !!lastRun,
      available: built,
      detail: tests
        ? `${tests} test case${tests === 1 ? "" : "s"}${lastRun ? ` · ${lastRun.summary.passed}/${lastRun.summary.total} passing` : " · not run yet"}`
        : "Try it and save test cases",
    },
    {
      key: "secure",
      label: "Secure",
      step: "secure",
      steps: ["secure", "improve"],
      done: !!sec && !sec.partial,
      available: built,
      detail: sec ? `Security score ${sec.summary.score}${sec.partial ? " (partial)" : ""}` : "Attack it before launch",
    },
    {
      key: "ship",
      label: "Ship",
      step: "export",
      steps: ["export"],
      done: !!p.exportedAt,
      available: built,
      detail: p.exportedAt ? `Downloaded ${timeAgo(p.exportedAt)}` : "Get your code, tests and CI",
    },
  ];
}

/** The most useful thing to do next, in plain words. */
export function nextStep(p: ProjectState): { step: Step; text: string } | null {
  const s = stages(p);
  const byKey = Object.fromEntries(s.map((x) => [x.key, x])) as Record<StageKey, StageStatus>;
  if (!byKey.build.done) {
    return { step: "describe", text: p.design.messages.length ? "Keep talking it through, then press Build it." : "Describe your idea to start." };
  }
  if (!p.savedTestCases.length) return { step: "playground", text: "Try your app and save a few good and bad answers as test cases." };
  if (!byKey.test.done) return { step: "evaluate", text: "Run your test cases to get a baseline." };
  if (!byKey.secure.done) return { step: "secure", text: "Run the security tests before you ship." };
  if (p.securityResult && p.securityResult.summary.failed > 0 && !p.improvement) {
    return { step: "improve", text: `Fix ${p.securityResult.summary.failed} security issue(s) with a hardened prompt.` };
  }
  if (!byKey.ship.done) return { step: "export", text: "Download your starter project, tests and CI." };
  return null;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
