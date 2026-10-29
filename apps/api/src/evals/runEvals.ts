/*
 * `pnpm --filter @trakwyn/api eval`: runs the eval cases against real models.
 * This calls paid APIs, so it is a script you run on purpose; nothing under
 * `src/__tests__` imports it and the vitest `include` only matches
 * `*.test.ts`, which is why `pnpm test` and CI never reach a provider.
 *
 * Exit status: 0 when every target met the pass rate, 1 when one fell short,
 * 2 when the arguments were wrong.
 */
import { buildProvider, targetLabel } from '#src/evals/buildProvider.js';
import { ALL_CASES, selectCases } from '#src/evals/cases/index.js';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';
import { runSuite } from '#src/evals/runSuite.js';
import { formatReport, meetsPassRate, summarise, type TargetRun } from '#src/evals/summary.js';
import type { CaseResult, EvalConfig } from '#src/evals/types.js';

const CACHE_DIR = '.eval-cache';
const USAGE_ERROR = 2;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function progressLine(result: CaseResult): string {
  return `  ${result.passed ? 'pass' : 'FAIL'}  ${result.caseId}  (${Math.round(result.latencyMs)} ms)`;
}

async function runTargets(config: EvalConfig): Promise<TargetRun[]> {
  const cases = selectCases(ALL_CASES, config.caseIds);
  const cache = config.cache ? { dir: CACHE_DIR, refresh: config.refresh } : null;
  const runs: TargetRun[] = [];

  for (const target of config.targets) {
    const label = targetLabel(target);
    console.log(`\n${label}: ${cases.length} cases`);
    const results = await runSuite(buildProvider(target, cache), cases, (result) =>
      console.log(progressLine(result)),
    );
    runs.push({ label, results });
  }
  return runs;
}

async function main(): Promise<number> {
  let runs: TargetRun[];
  let config: EvalConfig;

  try {
    config = parseEvalArgs(process.argv.slice(2), process.env);
    runs = await runTargets(config);
  } catch (error: unknown) {
    console.error(messageOf(error));
    return USAGE_ERROR;
  }

  console.log(`\n${formatReport(runs)}`);

  const short = runs.filter((run) => !meetsPassRate(summarise(run.results), config.minPassRate));
  if (short.length > 0) {
    console.error(
      `\nBelow the ${Math.round(config.minPassRate * 100)}% pass rate: ${short.map((run) => run.label).join(', ')}`,
    );
    return 1;
  }
  return 0;
}

process.exitCode = await main();
