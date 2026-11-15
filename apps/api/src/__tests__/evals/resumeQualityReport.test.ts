import { describe, expect, it, vi } from 'vitest';
import { formatReport, type TargetRun } from '#src/evals/summary.js';
import {
  publishRuns,
  type LangfuseGateway,
  type RunMetadata,
} from '#src/evals/publish/langfusePublisher.js';
import type { ResumeQualityScores } from '#src/evals/judge/resumeQuality.js';
import type { CaseResult } from '#src/evals/types.js';

const quality = (
  coverage: number,
  terms: number,
  specificity: number,
  summary: number,
  omittedMustHaves: string[] = [],
): ResumeQualityScores => ({
  scores: { coverage, terms, specificity, summary },
  reasons: {
    coverage: 'most must-haves shown',
    terms: '',
    specificity: 'numbers kept',
    summary: 'aimed at the role',
  },
  omittedMustHaves,
});

const result = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'resume-thin-profile',
  feature: 'resume',
  prompt: 'resume@6',
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

describe('the report and resume quality (JEF-599)', () => {
  it('adds a Resume quality column and a section only when something was scored', () => {
    const plain = formatReport([{ label: 'a:one', results: [result()] }]);
    expect(plain).not.toContain('Resume quality');

    const scored = formatReport([
      {
        label: 'a:one',
        results: [
          result({ caseId: 'resume-a', quality: quality(4, 4, 4, 4) }),
          result({
            caseId: 'resume-b',
            quality: quality(2, 3, 4, 5, ['Kafka at scale', 'hiring']),
          }),
        ],
      },
    ]);

    expect(scored).toContain('Resume quality');
    // mean of 4.0 and 3.5
    expect(scored).toContain('3.8 (2)');
    expect(scored).toContain('Resume quality (1 to 5, reported and not scored):');
    expect(scored).toContain('coverage 3.0, terms 3.5, specificity 4.0, summary 4.5');
    expect(scored).toContain('resume-b: 3.5 (coverage 2, terms 3, specificity 4, summary 5)');
    expect(scored).toContain('left out: Kafka at scale, hiring');
  });

  it('shows a dash for a target with no scores, beside one that has them', () => {
    const runs: TargetRun[] = [
      { label: 'a:one', results: [result({ quality: quality(5, 5, 5, 5) })] },
      { label: 'b:two', results: [result()] },
    ];

    const report = formatReport(runs);

    expect(report).toMatch(/b:two\s.*\s-\s/);
    expect(report).toContain('5.0 (1)');
  });

  it('says why a case has no score, and never counts it as a failure', () => {
    const report = formatReport([
      {
        label: 'a:one',
        results: [
          result({ caseId: 'resume-a', quality: quality(4, 4, 4, 4) }),
          result({
            caseId: 'resume-b',
            qualityNote: 'the judge replied with something unreadable',
          }),
        ],
      },
    ]);

    expect(report).toContain('resume-b: no score (the judge replied with something unreadable)');
    expect(report).toContain('no failures');
  });

  it('does not change the pass rate, which stays on the invented-content check', () => {
    const report = formatReport([
      { label: 'a:one', results: [result({ quality: quality(1, 1, 1, 1) })] },
    ]);

    expect(report).toContain('1/1 (100%)');
  });
});

describe('Langfuse and resume quality (JEF-599)', () => {
  const meta: RunMetadata = {
    commit: 'abc1234',
    startedAt: new Date('2026-11-11T22:30:00.000Z'),
    judge: 'openai:judge-x',
    maxErrorRate: 0.1,
  };
  const gateway = (): LangfuseGateway => ({
    upsertDataset: vi.fn(async () => undefined),
    upsertItems: vi.fn(async () => undefined),
    runExperiment: vi.fn(async () => ({ url: 'https://cloud.langfuse.com/run/1' })),
  });

  it('sends the mean and one score per criterion, with the omitted must-haves on the mean', async () => {
    const g = gateway();
    await publishRuns(
      g,
      [
        {
          label: 'a:one',
          results: [result({ quality: quality(4, 3, 5, 2, ['Kafka at scale']) })],
        },
      ],
      meta,
    );

    const scores = vi.mocked(g.runExperiment).mock.calls[0]![0].items[0]!.scores;
    expect(scores.find((s) => s.name === 'quality')).toEqual({
      name: 'quality',
      value: 3.5,
      dataType: 'NUMERIC',
      comment: 'left out: Kafka at scale',
    });
    expect(
      scores.filter((s) => s.name.startsWith('quality_')).map((s) => [s.name, s.value]),
    ).toEqual([
      ['quality_coverage', 4],
      ['quality_terms', 3],
      ['quality_specificity', 5],
      ['quality_summary', 2],
    ]);
    expect(scores.find((s) => s.name === 'quality_terms')?.comment).toBeUndefined();
    expect(scores.find((s) => s.name === 'quality_summary')?.comment).toBe('aimed at the role');
    // The existing scores are still there.
    expect(scores.map((s) => s.name)).toEqual(expect.arrayContaining(['outcome', 'passed']));
  });

  it('sends no quality scores for a case without any', async () => {
    const g = gateway();
    await publishRuns(g, [{ label: 'a:one', results: [result()] }], meta);

    const scores = vi.mocked(g.runExperiment).mock.calls[0]![0].items[0]!.scores;
    expect(scores.some((s) => s.name.startsWith('quality'))).toBe(false);
  });
});
