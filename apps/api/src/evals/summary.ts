import type { CaseResult, EvalFeature } from '#src/evals/types.js';

export interface RunSummary {
  total: number;
  passed: number;
  passRate: number;
  schemaValidRate: number;
  promptTokens: number;
  completionTokens: number;
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

/** A table with a row per target, then each failing case and why it failed. */
export function formatReport(runs: TargetRun[]): string {
  const rows = runs.map(({ label, results }) => {
    const summary = summarise(results);
    return [
      label,
      `${summary.passed}/${summary.total} (${percent(summary.passRate)})`,
      percent(summary.schemaValidRate),
      featureColumn(summary),
      `${summary.promptTokens}/${summary.completionTokens}`,
      `${Math.round(summary.meanLatencyMs)} ms`,
    ];
  });
  const header = ['Target', 'Passed', 'Schema', 'By feature', 'Tokens in/out', 'Mean latency'];
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
    '',
    failures.length === 0 ? 'no failures' : `Failures:\n${failures.join('\n')}`,
  ].join('\n');
}
