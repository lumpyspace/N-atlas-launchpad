/**
 * CLI evaluation runner — run a suite from the terminal and print a readable
 * report. Handy for demos without the UI.
 *
 *   npm run eval                          # default suite, all cases
 *   npm run eval -- --suite nigerian-context --max 3
 *
 * Exits non-zero if any case failed or errored, so it can gate CI later.
 */

import { loadConfig } from "../config.js";
import { createProvider } from "../providers/index.js";
import { runSuite } from "./runner.js";
import { DEFAULT_SUITE } from "./suites.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const suite = arg("suite") ?? DEFAULT_SUITE;
  const maxRaw = arg("max");
  const maxCases = maxRaw ? Number(maxRaw) : undefined;

  const config = loadConfig();
  const provider = createProvider(config);

  console.log(`\n— N-ATLAS Launchpad evaluation: "${suite}" —`);
  if (provider.isMock) {
    console.log("⚠️  MOCK provider active — these results are NOT real N-ATLAS output.\n");
  }

  const run = await runSuite(suite, provider, { maxCases });

  console.log("\n================ RESULTS ================");
  for (const c of run.cases) {
    const status = c.error ? "ERROR" : c.passed ? "PASS " : "FAIL ";
    console.log(`[${status}] ${c.caseId}  (${c.category}, ${Math.round(c.score * 100)}%)`);
    if (!c.passed) {
      if (c.error) {
        console.log(`         error: ${c.error}`);
      } else {
        for (const chk of c.checks.filter((r) => !r.passed)) {
          console.log(`         ✗ ${chk.label} — ${chk.detail}`);
        }
      }
      const preview = c.output.replace(/\s+/g, " ").slice(0, 120);
      if (preview) console.log(`         output: "${preview}${c.output.length > 120 ? "…" : ""}"`);
    }
  }

  const s = run.summary;
  console.log("\n================ SUMMARY ================");
  console.log(`suite    : ${run.suite}`);
  console.log(`provider : ${run.provider}  (model: ${run.model}, isMock: ${run.isMock})`);
  console.log(`passed   : ${s.passed}/${s.total}   failed: ${s.failed}   errored: ${s.errored}`);
  console.log(`pass rate: ${Math.round(s.passRate * 100)}%`);
  console.log(`by category:`);
  for (const [cat, v] of Object.entries(s.byCategory)) {
    console.log(`   ${cat.padEnd(12)} ${v.passed}/${v.total}`);
  }
  console.log(`duration : ${(run.durationMs / 1000).toFixed(1)}s\n`);

  process.exit(s.failed + s.errored > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Evaluation run crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
