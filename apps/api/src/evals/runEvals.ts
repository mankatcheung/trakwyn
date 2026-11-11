/*
 * `pnpm --filter @trakwyn/api eval`: runs the eval cases against real models.
 * This calls paid APIs, so it is a script you run on purpose; nothing under
 * `src/__tests__` imports it and the vitest `include` only matches
 * `*.test.ts`, which is why `pnpm test` and CI never reach a provider.
 *
 * Exit status: 0 when every target met the pass rate, 1 when one fell short
 * (or the judge was not trusted), 2 when the arguments were wrong.
 */
import { buildProvider, targetLabel } from '#src/evals/buildProvider.js';
import { ALL_CASES, selectCases } from '#src/evals/cases/index.js';
import { requireJudge } from '#src/evals/judge/requireJudge.js';
import {
  formatValidation,
  JUDGE_MIN_ACCURACY,
  validateJudge,
} from '#src/evals/judge/validateJudge.js';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';
import { publishToLangfuse } from '#src/evals/publish/publishToLangfuse.js';
import { writeReportFile } from '#src/evals/reportFile.js';
import { runSuite } from '#src/evals/runSuite.js';
import {
  formatReport,
  meetsPassRate,
  summarise,
  type CacheCounts,
  type TargetRun,
} from '#src/evals/summary.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalConfig } from '#src/evals/types.js';

const CACHE_DIR = '.eval-cache';
const USAGE_ERROR = 2;

type Cache = { dir: string; refresh: boolean } | null;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function progressLine(result: CaseResult): string {
  const toolUse =
    result.feature === 'chat' ? `  ${result.toolCalls} calls, ${result.iterations} iterations` : '';
  return `  ${result.passed ? 'pass' : 'FAIL'}  ${result.caseId}  (${Math.round(result.latencyMs)} ms)${toolUse}`;
}

async function runTargets(
  config: EvalConfig,
  judge: ILLMProvider | null,
  cache: Cache,
): Promise<TargetRun[]> {
  const cases = selectCases(ALL_CASES, config.caseIds);
  const runs: TargetRun[] = [];

  for (const target of config.targets) {
    const label = targetLabel(target);
    console.log(`\n${label}: ${cases.length} cases`);
    let counts: CacheCounts = { hits: 0, misses: 0 };
    const targetCache = cache
      ? {
          ...cache,
          onLookup: (hit: boolean) => {
            counts = hit
              ? { ...counts, hits: counts.hits + 1 }
              : { ...counts, misses: counts.misses + 1 };
          },
        }
      : null;
    const results = await runSuite(
      buildProvider(target, targetCache),
      cases,
      (result) => console.log(progressLine(result)),
      judge ?? undefined,
    );
    runs.push(cache ? { label, results, cache: counts } : { label, results });
  }
  return runs;
}

async function main(): Promise<number> {
  let config: EvalConfig;
  let cache: Cache;
  let judge: ILLMProvider | null;

  try {
    config = parseEvalArgs(process.argv.slice(2), process.env);
    cache = config.cache ? { dir: CACHE_DIR, refresh: config.refresh } : null;
    const judgeTarget = config.validateJudge
      ? config.judge
      : requireJudge(config, selectCases(ALL_CASES, config.caseIds));
    judge = judgeTarget ? buildProvider(judgeTarget, cache) : null;
  } catch (error: unknown) {
    console.error(messageOf(error));
    return USAGE_ERROR;
  }

  // The judge's scores count only once it has sorted hand-labelled outputs
  // correctly. This runs before any target is called, so an untrusted judge
  // costs the grading calls and nothing more.
  if (judge) {
    const validation = await validateJudge(judge);
    console.log(formatValidation(validation, JUDGE_MIN_ACCURACY));
    if (!validation.meetsThreshold) return 1;
    if (config.validateJudge) return 0;
  }

  let runs: TargetRun[];
  try {
    runs = await runTargets(config, judge, cache);
  } catch (error: unknown) {
    console.error(messageOf(error));
    return USAGE_ERROR;
  }

  const report = formatReport(runs);
  console.log(`\n${report}`);
  if (config.reportFile) {
    try {
      writeReportFile(config.reportFile, report);
      console.log(`\nReport written to ${config.reportFile}`);
    } catch (error: unknown) {
      console.error(`Could not write the report to ${config.reportFile}: ${messageOf(error)}`);
    }
  }

  // After the report is printed and written: a Langfuse failure is logged by
  // `publishToLangfuse` and never changes the exit code, which is the pass rate's.
  if (config.publish) {
    await publishToLangfuse(config.publish, runs, config.judge ? targetLabel(config.judge) : null);
  }

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
