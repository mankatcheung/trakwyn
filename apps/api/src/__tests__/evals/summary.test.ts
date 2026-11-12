import { describe, expect, it } from 'vitest';
import {
  formatQuotaStops,
  formatReport,
  meetsPassRate,
  stoppedOnQuota,
  summarise,
  tooManyErrors,
  formatUntrusted,
} from '#src/evals/summary.js';
import type { CaseResult } from '#src/evals/types.js';

const result = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'c',
  feature: 'jobDescription',
  prompt: 'parseJobDescription@1',
  outcome: 'pass',
  passed: true,
  schemaValid: true,
  failures: [],
  promptTokens: 100,
  completionTokens: 20,
  judgePromptTokens: 0,
  judgeCompletionTokens: 0,
  latencyMs: 400,
  toolCalls: 0,
  iterations: 0,
  calls: [],
  judgeCalls: [],
  ...overrides,
});

describe('summarise', () => {
  it('counts passes, schema validity, tokens and mean latency', () => {
    const summary = summarise([
      result(),
      result({ outcome: 'fail', passed: false, failures: ['x'], latencyMs: 600 }),
      result({
        outcome: 'fail',
        passed: false,
        schemaValid: false,
        promptTokens: 0,
        completionTokens: 0,
      }),
      result({ feature: 'resumeMatch' }),
    ]);

    expect(summary).toMatchObject({
      total: 4,
      passed: 2,
      passRate: 0.5,
      schemaValidRate: 0.75,
      promptTokens: 300,
      completionTokens: 60,
    });
    expect(summary.meanLatencyMs).toBe(450);
    expect(summary.byFeature).toEqual({
      jobDescription: { total: 3, passed: 1 },
      resumeMatch: { total: 1, passed: 1 },
    });
  });

  it('reports zeros for no results instead of dividing by zero', () => {
    expect(summarise([])).toMatchObject({
      total: 0,
      passRate: 0,
      schemaValidRate: 0,
      meanLatencyMs: 0,
    });
  });
});

describe('meetsPassRate', () => {
  it('is inclusive of the floor, and false for an empty run', () => {
    expect(
      meetsPassRate(summarise([result(), result({ outcome: 'fail', passed: false })]), 0.5),
    ).toBe(true);
    expect(
      meetsPassRate(summarise([result(), result({ outcome: 'fail', passed: false })]), 0.6),
    ).toBe(false);
    expect(meetsPassRate(summarise([]), 0)).toBe(false);
  });
});

describe('formatReport', () => {
  it('prints one row per target and lists each failing case with its reasons', () => {
    const report = formatReport([
      { label: 'openai:gpt-x', results: [result({ caseId: 'ok-case' })] },
      {
        label: 'anthropic:claude-y',
        results: [
          result({
            caseId: 'bad-case',
            outcome: 'fail',
            passed: false,
            failures: ['score 90 above 25'],
          }),
        ],
      },
    ]);

    expect(report).toContain('openai:gpt-x');
    expect(report).toContain('anthropic:claude-y');
    expect(report).toContain('100%');
    expect(report).toContain('0%');
    expect(report).toContain('bad-case');
    expect(report).toContain('score 90 above 25');
    expect(report).not.toContain('ok-case');
  });

  it('names the prompt versions each target ran, so runs before and after a change differ (JEF-505)', () => {
    const report = formatReport([
      {
        label: 'openai:gpt-x',
        results: [
          result(),
          result({ feature: 'resumeMatch', prompt: 'resumeMatch@2' }),
          result({ caseId: 'again' }),
        ],
      },
    ]);

    expect(report).toContain('Prompts');
    expect(report).toContain('parseJobDescription@1, resumeMatch@2');
    // Each distinct prompt once, however many cases ran against it.
    expect(report.match(/parseJobDescription@1/g)).toHaveLength(1);
  });

  it('says so when nothing failed', () => {
    expect(formatReport([{ label: 't', results: [result()] }])).toContain('no failures');
  });
});

describe('formatReport cache counts (JEF-542)', () => {
  it('adds no cache column when the run did not use the cache', () => {
    expect(formatReport([{ label: 'openai:m', results: [result()] }])).not.toContain('Cache');
  });

  it('shows hits/misses per target and the latency when some replies were fresh', () => {
    const report = formatReport([
      { label: 'openai:m', results: [result()], cache: { hits: 3, misses: 2 } },
    ]);

    expect(report).toContain('Cache hit/miss');
    expect(report).toContain('3/2');
    expect(report).toContain('400 ms');
  });

  it('says cached, not 0 ms, when every reply came from disk', () => {
    const report = formatReport([
      {
        label: 'openai:m',
        results: [result({ latencyMs: 0 })],
        cache: { hits: 5, misses: 0 },
      },
    ]);

    expect(report).toContain('5/0');
    expect(report).toContain('cached');
    expect(report).not.toContain('0 ms');
  });

  it('keeps the latency when the cache was on but nothing was looked up', () => {
    const report = formatReport([
      { label: 'openai:m', results: [result()], cache: { hits: 0, misses: 0 } },
    ]);

    expect(report).toContain('400 ms');
  });
});

const passes = (count: number) => Array.from({ length: count }, () => result());
const fails = (count: number) =>
  Array.from({ length: count }, () =>
    result({ outcome: 'fail', passed: false, failures: ['wrong'] }),
  );
const errored = (count: number, detail = 'error: HTTP 429') =>
  Array.from({ length: count }, (_, index) =>
    result({ caseId: `err-${index}`, outcome: 'error', passed: false, failures: [detail] }),
  );

describe('outcomes (JEF-559)', () => {
  const luna = [...passes(61), ...fails(2), ...errored(2)];

  it('scores only the cases that ran: 61 passes, 2 fails and 2 errors is 61/63', () => {
    const summary = summarise(luna);

    expect(summary).toMatchObject({ total: 65, ran: 63, passed: 61, errors: 2, skipped: 0 });
    expect(summary.passRate).toBeCloseTo(61 / 63);
    expect(meetsPassRate(summary, 0.8)).toBe(true);
  });

  it('counts cases the runner never started as skipped', () => {
    expect(summarise([result()], 52)).toMatchObject({ ran: 1, skipped: 52 });
  });

  it('does not meet the floor when nothing was scored', () => {
    expect(meetsPassRate(summarise(errored(3)), 0)).toBe(false);
  });

  it('counts the by-feature column over the cases that ran', () => {
    const summary = summarise([result(), ...errored(2)]);

    expect(summary.byFeature).toEqual({ jobDescription: { total: 1, passed: 1 } });
  });

  it('prints Passed as passed/ran with Errors and Skipped columns', () => {
    const report = formatReport([{ label: 'luna', results: luna, skipped: 3 }]);
    const [header, row] = report.split('\n') as [string, string];

    expect(header).toMatch(/Passed\s+Errors\s+Skipped/);
    expect(row).toMatch(/61\/63 \(97%\)\s+2\s+3\s/);
  });

  it('lists failures and errors apart', () => {
    const report = formatReport([{ label: 'luna', results: [...fails(1), ...errored(1)] }]);

    expect(report).toMatch(/Failures:\n.*wrong/);
    expect(report).toMatch(/Errors:\n.*err-0.*HTTP 429/);
    expect(report.indexOf('Failures:')).toBeLessThan(report.indexOf('Errors:'));
    expect(report.split('Errors:')[0]).not.toContain('err-0');
  });

  it('prints no Errors list when there are none', () => {
    expect(formatReport([{ label: 't', results: passes(2) }])).not.toContain('Errors:');
  });

  it('flags a target with more than the allowed share of errors, and says why in the report', () => {
    const edge = { label: 'edge', results: [...passes(9), ...errored(1)] };
    const bad = { label: 'bad', results: [...passes(7), ...errored(3)] };

    expect(tooManyErrors(edge, 0.1)).toBe(false);
    expect(tooManyErrors(bad, 0.1)).toBe(true);
    expect(formatUntrusted([edge], 0.1)).toEqual([]);

    const report = formatReport([bad, edge], 0.1);
    expect(report).toContain('bad is not trusted: 3 of 10 cases errored (30%)');
    expect(report).not.toContain('edge is not trusted');
  });

  it('never flags a run without results', () => {
    expect(tooManyErrors({ label: 't', results: [] }, 0)).toBe(false);
  });
});

describe('quota stops (JEF-556)', () => {
  const stopped = {
    label: 'workersai:@cf/google/gemma-4-26b-a4b-it',
    results: [
      result(),
      result({ outcome: 'error', passed: false, quotaStop: true, failures: ['error: 429'] }),
    ],
    skipped: 52,
  };

  it('recognises a stopped target', () => {
    expect(stoppedOnQuota(stopped)).toBe(true);
    expect(stoppedOnQuota({ label: 't', results: [result()] })).toBe(false);
  });

  it('says how many ran, how many were skipped and when it resets', () => {
    const [line] = formatQuotaStops([stopped, { label: 'ok', results: [result()] }]);

    expect(line).toContain('workersai:@cf/google/gemma-4-26b-a4b-it stopped');
    expect(line).toContain('after 2 cases; 52 skipped');
    expect(line).toContain('00:00 UTC');
  });

  it('shows the row as stopped instead of a pass rate', () => {
    const report = formatReport([stopped]);

    expect(report).toContain('stopped (quota)');
    expect(report).not.toContain('(50%)');
    expect(report).toContain('daily quota used up');
  });
});
