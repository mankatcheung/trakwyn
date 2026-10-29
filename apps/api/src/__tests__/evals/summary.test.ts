import { describe, expect, it } from 'vitest';
import { formatReport, meetsPassRate, summarise } from '#src/evals/summary.js';
import type { CaseResult } from '#src/evals/types.js';

const result = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'c',
  feature: 'jobDescription',
  passed: true,
  schemaValid: true,
  failures: [],
  promptTokens: 100,
  completionTokens: 20,
  latencyMs: 400,
  ...overrides,
});

describe('summarise', () => {
  it('counts passes, schema validity, tokens and mean latency', () => {
    const summary = summarise([
      result(),
      result({ passed: false, failures: ['x'], latencyMs: 600 }),
      result({ passed: false, schemaValid: false, promptTokens: 0, completionTokens: 0 }),
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
    expect(meetsPassRate(summarise([result(), result({ passed: false })]), 0.5)).toBe(true);
    expect(meetsPassRate(summarise([result(), result({ passed: false })]), 0.6)).toBe(false);
    expect(meetsPassRate(summarise([]), 0)).toBe(false);
  });
});

describe('formatReport', () => {
  it('prints one row per target and lists each failing case with its reasons', () => {
    const report = formatReport([
      { label: 'openai:gpt-x', results: [result({ caseId: 'ok-case' })] },
      {
        label: 'anthropic:claude-y',
        results: [result({ caseId: 'bad-case', passed: false, failures: ['score 90 above 25'] })],
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

  it('says so when nothing failed', () => {
    expect(formatReport([{ label: 't', results: [result()] }])).toContain('no failures');
  });
});
