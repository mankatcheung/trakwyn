import { QUALITY_CRITERIA, meanQuality } from '#src/evals/judge/resumeQuality.js';
import { CLOUDFLARE_DAILY_QUOTA } from '#src/evals/quotaStop.js';
import type { CaseResult, EvalFeature } from '#src/evals/types.js';

export interface RunSummary {
  /** Every case that has a result, whatever its outcome. */
  total: number;
  /** Cases that were scored: passed plus failed. Errors and skipped cases are not. */
  ran: number;
  passed: number;
  /** Cases the provider (or the harness) errored on, which say nothing about the model (JEF-559). */
  errors: number;
  /** Cases never run, because the target stopped on its quota. */
  skipped: number;
  /** Passed over passed plus failed. */
  passRate: number;
  /** Errors over every case with a result. */
  errorRate: number;
  schemaValidRate: number;
  promptTokens: number;
  completionTokens: number;
  judgePromptTokens: number;
  judgeCompletionTokens: number;
  meanLatencyMs: number;
  /** Passed out of the cases that ran, per feature. */
  byFeature: Partial<Record<EvalFeature, { total: number; passed: number }>>;
}

export interface CacheCounts {
  hits: number;
  misses: number;
}

export interface TargetRun {
  label: string;
  results: CaseResult[];
  /** Present only when the run used `--cache`. */
  cache?: CacheCounts;
  /** Set when the run stopped on the provider's quota: how many cases were never run (JEF-556). */
  skipped?: number;
}

/** The target stopped on a quota: its cases are not a score. */
export const stoppedOnQuota = (run: TargetRun): boolean =>
  run.results.some((result) => result.quotaStop === true);

/** One line per target that stopped on a quota, saying why and when it resets. */
export function formatQuotaStops(runs: TargetRun[]): string[] {
  return runs
    .filter(stoppedOnQuota)
    .map(
      (run) =>
        `${run.label} stopped: daily quota used up after ${run.results.length} case${run.results.length === 1 ? '' : 's'}; ${run.skipped ?? 0} skipped. ` +
        `Cloudflare resets its free allocation at ${CLOUDFLARE_DAILY_QUOTA.resetsAt}; other providers reset on their own schedule. ` +
        'Cases already answered are cached with --cache.',
    );
}

/** The target had more errors than `maxErrorRate` allows, so its pass rate is not to be trusted (JEF-559). */
export function tooManyErrors(run: TargetRun, maxErrorRate: number): boolean {
  return summarise(run.results).errorRate > maxErrorRate;
}

/** One line per target with too many errors, saying how many and what to do. */
export function formatUntrusted(runs: TargetRun[], maxErrorRate: number): string[] {
  return runs
    .filter((run) => tooManyErrors(run, maxErrorRate))
    .map((run) => {
      const { errors, total, errorRate } = summarise(run.results);
      return (
        `${run.label} is not trusted: ${errors} of ${total} cases errored (${percent(errorRate)}), ` +
        `above the ${percent(maxErrorRate)} allowed by --max-error-rate. ` +
        "Errors are the provider's or the harness's, so the pass rate covers too few cases. See Errors below."
      );
    });
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const isScored = (result: CaseResult): boolean =>
  result.outcome === 'pass' || result.outcome === 'fail';

/**
 * `notRun` is the cases the runner never started (a quota stop), which have no
 * result to count; they are added to the results marked `skipped`.
 */
export function summarise(results: CaseResult[], notRun = 0): RunSummary {
  const scored = results.filter(isScored);
  const byFeature = scored.reduce<RunSummary['byFeature']>((acc, result) => {
    const seen = acc[result.feature] ?? { total: 0, passed: 0 };
    return {
      ...acc,
      [result.feature]: { total: seen.total + 1, passed: seen.passed + (result.passed ? 1 : 0) },
    };
  }, {});
  const passed = results.filter((result) => result.outcome === 'pass').length;
  const errors = results.filter((result) => result.outcome === 'error').length;

  return {
    total: results.length,
    ran: scored.length,
    passed,
    errors,
    skipped: notRun + results.filter((result) => result.outcome === 'skipped').length,
    passRate: ratio(passed, scored.length),
    errorRate: ratio(errors, results.length),
    schemaValidRate: ratio(results.filter((result) => result.schemaValid).length, results.length),
    promptTokens: results.reduce((sum, result) => sum + result.promptTokens, 0),
    completionTokens: results.reduce((sum, result) => sum + result.completionTokens, 0),
    judgePromptTokens: results.reduce((sum, result) => sum + result.judgePromptTokens, 0),
    judgeCompletionTokens: results.reduce((sum, result) => sum + result.judgeCompletionTokens, 0),
    meanLatencyMs: ratio(
      results.reduce((sum, result) => sum + result.latencyMs, 0),
      results.length,
    ),
    byFeature,
  };
}

/** A run that scored nothing never meets the floor: running nothing is not a pass. */
export function meetsPassRate(summary: RunSummary, minPassRate: number): boolean {
  return summary.ran > 0 && summary.passRate >= minPassRate;
}

function featureColumn(summary: RunSummary): string {
  return Object.entries(summary.byFeature)
    .map(([feature, counts]) => `${feature} ${counts.passed}/${counts.total}`)
    .join(', ');
}

/** The distinct `id@version` of the prompts a target's cases ran against (JEF-505). */
function promptColumn(results: CaseResult[]): string {
  return [...new Set(results.map((result) => result.prompt))].sort().join(', ');
}

/**
 * Tool calls and loop iterations for every chat case (JEF-471), since a cheaper
 * model (JEF-448) can pass a case by calling more tools than it should, and a
 * tighter loop limit shows up as iterations reaching the cap.
 */
function toolUseSection(runs: TargetRun[]): string[] {
  const lines = runs.flatMap(({ label, results }) =>
    results
      .filter((result) => result.feature === 'chat')
      .map(
        (result) =>
          `  ${label}  ${result.caseId}: ${result.toolCalls} tool call${result.toolCalls === 1 ? '' : 's'}, ${result.iterations} iteration${result.iterations === 1 ? '' : 's'}`,
      ),
  );
  return lines.length === 0 ? [] : ['', 'Chat tool use:', ...lines];
}

const toOne = (value: number): string => value.toFixed(1);

/** The mean of the cases' mean quality, and how many cases that is; null when none was scored (JEF-599). */
function qualityMean(results: CaseResult[]): { mean: number; cases: number } | null {
  const scored = results.filter((result) => result.quality !== undefined);
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, result) => sum + meanQuality(result.quality!), 0);
  return { mean: total / scored.length, cases: scored.length };
}

/**
 * Resume quality per target and per case (JEF-599): what a prompt or model
 * change is compared on, since pass or fail only says nothing was invented.
 * Scores run from 1 to 5 and are reported, never scored.
 */
function qualitySection(runs: TargetRun[]): string[] {
  const lines = runs.flatMap(({ label, results }) => {
    const scored = results.filter((result) => result.quality !== undefined);
    const noted = results.filter((result) => result.quality === undefined && result.qualityNote);
    if (scored.length === 0 && noted.length === 0) return [];
    const perCriterion = QUALITY_CRITERIA.map((criterion) => {
      const mean =
        scored.reduce((sum, result) => sum + result.quality!.scores[criterion], 0) / scored.length;
      return `${criterion} ${toOne(mean)}`;
    }).join(', ');
    return [
      ...(scored.length > 0 ? [`  ${label}  ${perCriterion}`] : []),
      ...scored.map((result) => {
        const quality = result.quality!;
        const scores = QUALITY_CRITERIA.map(
          (criterion) => `${criterion} ${quality.scores[criterion]}`,
        ).join(', ');
        const omitted =
          quality.omittedMustHaves.length > 0
            ? `; left out: ${quality.omittedMustHaves.join(', ')}`
            : '';
        return `    ${result.caseId}: ${toOne(meanQuality(quality))} (${scores})${omitted}`;
      }),
      ...noted.map((result) => `    ${result.caseId}: no score (${result.qualityNote})`),
    ];
  });
  return lines.length === 0
    ? []
    : ['', 'Resume quality (1 to 5, reported and not scored):', ...lines];
}

/** `cached` when every reply came from disk: a replay's `0 ms` is not a fast model. */
function latencyColumn(summary: RunSummary, cache: CacheCounts | undefined): string {
  if (cache && cache.hits > 0 && cache.misses === 0) return 'cached';
  return `${Math.round(summary.meanLatencyMs)} ms`;
}

const qualityCell = (results: CaseResult[]): string => {
  const quality = qualityMean(results);
  return quality === null ? '-' : `${toOne(quality.mean)} (${quality.cases})`;
};

/** A table with a row per target, then each failing case and why it failed. */
export function formatReport(runs: TargetRun[], maxErrorRate?: number): string {
  const showCache = runs.some((run) => run.cache !== undefined);
  const showQuality = runs.some((run) => qualityMean(run.results) !== null);
  const rows = runs.map(({ label, results, cache, skipped }) => {
    const summary = summarise(results, skipped ?? 0);
    return [
      label,
      stoppedOnQuota({ label, results })
        ? 'stopped (quota)'
        : `${summary.passed}/${summary.ran} (${percent(summary.passRate)})`,
      String(summary.errors),
      String(summary.skipped),
      percent(summary.schemaValidRate),
      featureColumn(summary),
      promptColumn(results),
      `${summary.promptTokens}/${summary.completionTokens}`,
      `${summary.judgePromptTokens}/${summary.judgeCompletionTokens}`,
      ...(showQuality ? [qualityCell(results)] : []),
      ...(showCache ? [cache ? `${cache.hits}/${cache.misses}` : '-'] : []),
      latencyColumn(summary, cache),
    ];
  });
  const header = [
    'Target',
    'Passed',
    'Errors',
    'Skipped',
    'Schema',
    'By feature',
    'Prompts',
    'Tokens in/out',
    'Judge tokens in/out',
    ...(showQuality ? ['Resume quality'] : []),
    ...(showCache ? ['Cache hit/miss'] : []),
    'Mean latency',
  ];
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] as string).length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column] as number)).join('  ');

  const listOutcome = (outcome: CaseResult['outcome']): string[] =>
    runs.flatMap(({ label, results }) =>
      results
        .filter((result) => result.outcome === outcome)
        .map(
          (result) =>
            `  ${label}  ${result.caseId} (${result.feature}): ${result.failures.join('; ')}`,
        ),
    );
  const failures = listOutcome('fail');
  const errors = listOutcome('error');
  const untrusted = maxErrorRate === undefined ? [] : formatUntrusted(runs, maxErrorRate);

  return [
    line(header),
    ...rows.map(line),
    ...toolUseSection(runs),
    ...qualitySection(runs),
    ...(formatQuotaStops(runs).length > 0 ? ['', ...formatQuotaStops(runs)] : []),
    ...(untrusted.length > 0 ? ['', ...untrusted] : []),
    '',
    failures.length === 0 ? 'no failures' : `Failures:\n${failures.join('\n')}`,
    ...(errors.length === 0 ? [] : ['', `Errors:\n${errors.join('\n')}`]),
  ].join('\n');
}
