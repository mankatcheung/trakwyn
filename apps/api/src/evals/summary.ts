import type { CaseResult, EvalFeature } from '#src/evals/types.js';

export interface RunSummary {
  total: number;
  passed: number;
  passRate: number;
  schemaValidRate: number;
  promptTokens: number;
  completionTokens: number;
  judgePromptTokens: number;
  judgeCompletionTokens: number;
  meanLatencyMs: number;
  byFeature: Partial<Record<EvalFeature, { total: number; passed: number }>>;
}

export interface TargetRun {
  label: string;
  results: CaseResult[];
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);
const percent = (value: number): string => `${Math.round(value * 100)}%`;

export function summarise(results: CaseResult[]): RunSummary {
  const byFeature = results.reduce<RunSummary['byFeature']>((acc, result) => {
    const seen = acc[result.feature] ?? { total: 0, passed: 0 };
    return {
      ...acc,
      [result.feature]: { total: seen.total + 1, passed: seen.passed + (result.passed ? 1 : 0) },
    };
  }, {});
  const passed = results.filter((result) => result.passed).length;

  return {
    total: results.length,
    passed,
    passRate: ratio(passed, results.length),
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

/** An empty run never meets the floor: running nothing is not a pass. */
export function meetsPassRate(summary: RunSummary, minPassRate: number): boolean {
  return summary.total > 0 && summary.passRate >= minPassRate;
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

/** A table with a row per target, then each failing case and why it failed. */
export function formatReport(runs: TargetRun[]): string {
  const rows = runs.map(({ label, results }) => {
    const summary = summarise(results);
    return [
      label,
      `${summary.passed}/${summary.total} (${percent(summary.passRate)})`,
      percent(summary.schemaValidRate),
      featureColumn(summary),
      promptColumn(results),
      `${summary.promptTokens}/${summary.completionTokens}`,
      `${summary.judgePromptTokens}/${summary.judgeCompletionTokens}`,
      `${Math.round(summary.meanLatencyMs)} ms`,
    ];
  });
  const header = [
    'Target',
    'Passed',
    'Schema',
    'By feature',
    'Prompts',
    'Tokens in/out',
    'Judge tokens in/out',
    'Mean latency',
  ];
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] as string).length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, column) => cell.padEnd(widths[column] as number)).join('  ');

  const failures = runs.flatMap(({ label, results }) =>
    results
      .filter((result) => !result.passed)
      .map(
        (result) =>
          `  ${label}  ${result.caseId} (${result.feature}): ${result.failures.join('; ')}`,
      ),
  );

  return [
    line(header),
    ...rows.map(line),
    ...toolUseSection(runs),
    '',
    failures.length === 0 ? 'no failures' : `Failures:\n${failures.join('\n')}`,
  ].join('\n');
}
