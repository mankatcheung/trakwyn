/*
 * `pnpm --filter @trakwyn/api eval`: runs the eval cases against real models.
 * This calls paid APIs, so it is a script you run on purpose; nothing under
 * `src/__tests__` imports it and the vitest `include` only matches
 * `*.test.ts`, which is why `pnpm test` and CI never reach a provider.
 *
 * Exit status: 0 when every target met the pass rate, 1 when one fell short
 * (or the judge was not trusted), 2 when the arguments were wrong, 3 when a
 * target stopped on its provider's daily quota (JEF-556), which is no score,
 * 4 when a target had more errors than `--max-error-rate` allows (JEF-559).
 */
import { buildProvider, targetLabel } from '#src/evals/buildProvider.js';
import { ALL_CASES, selectCases } from '#src/evals/cases/index.js';
import { requireJudge } from '#src/evals/judge/requireJudge.js';
import {
  formatQualityValidation,
  validateQualityJudge,
} from '#src/evals/judge/validateQualityJudge.js';
import {
  formatValidation,
  JUDGE_MIN_ACCURACY,
  validateJudge,
} from '#src/evals/judge/validateJudge.js';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';
import { withReasoning } from '#src/evals/reasoningOverride.js';
import { gitShortSha, publishToLangfuse } from '#src/evals/publish/publishToLangfuse.js';
import { publishSavedRun } from '#src/evals/publish/publishSavedRun.js';
import { showSavedRun } from '#src/evals/show/showSavedRun.js';
import { writeReportFile } from '#src/evals/reportFile.js';
import { saveRunFolder } from '#src/evals/runFolder.js';
import { runSuite } from '#src/evals/runSuite.js';
import {
  formatReport,
  meetsPassRate,
  stoppedOnQuota,
  summarise,
  tooManyErrors,
  type CacheCounts,
  type TargetRun,
} from '#src/evals/summary.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalConfig } from '#src/evals/types.js';

const CACHE_DIR = '.eval-cache';
const RUNS_DIR = '.eval-runs';
const USAGE_ERROR = 2;
const QUOTA_STOP = 3;
const TOO_MANY_ERRORS = 4;

type Cache = { dir: string; refresh: boolean } | null;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function progressLine(result: CaseResult): string {
  const toolUse =
    result.feature === 'chat' ? `  ${result.toolCalls} calls, ${result.iterations} iterations` : '';
  const label = { pass: 'pass', fail: 'FAIL', error: 'ERROR', skipped: 'skip' }[result.outcome];
  return `  ${label}  ${result.caseId}  (${Math.round(result.latencyMs)} ms)${toolUse}`;
}

async function runTargets(
  config: EvalConfig,
  judge: ILLMProvider | null,
  cache: Cache,
): Promise<TargetRun[]> {
  const cases = selectCases(ALL_CASES, config.caseIds);
  const runs: TargetRun[] = [];

  for (const target of config.targets) {
    // The level is part of the label, so two runs of one model at off and low read as two rows (JEF-599).
    const label = config.reasoning
      ? `${targetLabel(target)} reasoning=${config.reasoning}`
      : targetLabel(target);
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
    const built = buildProvider(target, targetCache);
    const results = await runSuite(
      config.reasoning ? withReasoning(built, config.reasoning) : built,
      cases,
      (result) => console.log(progressLine(result)),
      judge ?? undefined,
    );
    const skipped = cases.length - results.length;
    runs.push({
      label,
      results,
      ...(cache ? { cache: counts } : {}),
      ...(skipped > 0 ? { skipped } : {}),
    });
  }
  return runs;
}

/** Prints why the run failed, if it did, and returns the exit status. */
function exitCodeFor(runs: TargetRun[], minPassRate: number, maxErrorRate: number): number {
  if (runs.some(stoppedOnQuota)) {
    console.error(
      '\nStopped on a provider quota, so this run is not a score. See the lines above.',
    );
    return QUOTA_STOP;
  }

  const untrusted = runs.filter((run) => tooManyErrors(run, maxErrorRate));
  if (untrusted.length > 0) {
    console.error(
      `\nMore than ${Math.round(maxErrorRate * 100)}% of the cases errored: ${untrusted.map((run) => run.label).join(', ')}. The pass rate is not trusted. See the lines above.`,
    );
    return TOO_MANY_ERRORS;
  }

  const short = runs.filter((run) => !meetsPassRate(summarise(run.results), minPassRate));
  if (short.length > 0) {
    console.error(
      `\nBelow the ${Math.round(minPassRate * 100)}% pass rate: ${short.map((run) => run.label).join(', ')}`,
    );
    return 1;
  }
  return 0;
}

/** Keeps the run in its own folder (JEF-560). A write failure is reported and never changes the exit code. */
function saveRun(
  config: EvalConfig,
  runs: TargetRun[],
  report: string,
  startedAt: Date,
  exitCode: number,
): void {
  try {
    const dir = saveRunFolder(RUNS_DIR, {
      config,
      runs,
      report,
      caseIds: selectCases(ALL_CASES, config.caseIds).map((evalCase) => evalCase.id),
      commit: gitShortSha(),
      startedAt,
      finishedAt: new Date(),
      exitCode,
    });
    console.log(`\nRun saved to ${dir}`);
  } catch (error: unknown) {
    console.error(`Could not save the run to ${RUNS_DIR}: ${messageOf(error)}`);
  }
}

/**
 * Takes the quality scores off every result when the quality judge was not
 * trusted, with a note saying why, so an untrusted number is never compared.
 */
function withoutUntrustedQuality(runs: TargetRun[], trusted: boolean): TargetRun[] {
  if (trusted) return runs;
  return runs.map((run) => ({
    ...run,
    results: run.results.map(({ quality, ...rest }) =>
      quality === undefined
        ? rest
        : { ...rest, qualityNote: 'the quality judge was not trusted, so this score is left out' },
    ),
  }));
}

async function main(): Promise<number> {
  let config: EvalConfig;
  let cache: Cache;
  let judge: ILLMProvider | null;
  let needsQuality = false;

  try {
    config = parseEvalArgs(process.argv.slice(2), process.env);
    // print a saved run and stop; nothing is built or called.
    if (config.show !== null) return showSavedRun(config.show, config.caseIds);
    // JEF-562: upload a saved run and stop, before any provider is built.
    if (config.publishFrom) return await publishSavedRun(config.publishFrom);
    cache = config.cache ? { dir: CACHE_DIR, refresh: config.refresh } : null;
    const judgeTarget = config.validateJudge
      ? config.judge
      : requireJudge(config, selectCases(ALL_CASES, config.caseIds));
    judge = judgeTarget ? buildProvider(judgeTarget, cache) : null;
    needsQuality =
      config.validateJudge ||
      selectCases(ALL_CASES, config.caseIds).some((evalCase) => evalCase.feature === 'resume');
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
  }

  // The quality scores count only once the judge has ranked hand-labelled
  // pairs correctly (JEF-599). Unlike the claim check this does not stop the
  // run: quality is reported, never pass or fail, so an untrusted judge costs
  // the scores (dropped below) and not the invented-content result.
  let qualityTrusted = true;
  if (judge && needsQuality) {
    const quality = await validateQualityJudge(judge);
    console.log(`\n${formatQualityValidation(quality, JUDGE_MIN_ACCURACY)}`);
    qualityTrusted = quality.meetsThreshold;
    if (config.validateJudge) return qualityTrusted ? 0 : 1;
  } else if (config.validateJudge) {
    return 0;
  }

  const startedAt = new Date();
  let runs: TargetRun[];
  try {
    runs = withoutUntrustedQuality(await runTargets(config, judge, cache), qualityTrusted);
  } catch (error: unknown) {
    console.error(messageOf(error));
    return USAGE_ERROR;
  }

  const report = formatReport(runs, config.maxErrorRate);
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
    await publishToLangfuse(
      config.publish,
      runs,
      config.judge ? targetLabel(config.judge) : null,
      config.maxErrorRate,
    );
  }

  const exitCode = exitCodeFor(runs, config.minPassRate, config.maxErrorRate);
  if (config.save) {
    saveRun(config, runs, report, startedAt, exitCode);
  }
  return exitCode;
}

process.exitCode = await main();
