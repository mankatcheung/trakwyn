import { describe, expect, it, vi } from 'vitest';
import {
  buildRunName,
  publishRuns,
  type LangfuseGateway,
  type RunMetadata,
} from '#src/evals/publish/langfusePublisher.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult, RecordedCall } from '#src/evals/types.js';

const call = (overrides: Partial<RecordedCall> = {}): RecordedCall => ({
  kind: 'complete',
  messages: [{ role: 'user', content: 'Parse this posting' }],
  output: '{"title":"Engineer"}',
  toolCalls: [],
  promptTokens: 10,
  completionTokens: 5,
  latencyMs: 120,
  startedAt: 1_700_000_000_000,
  error: null,
  ...overrides,
});

const result = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  caseId: 'job-clean',
  feature: 'jobDescription',
  prompt: 'parseJobDescription@3',
  outcome: 'pass',
  passed: true,
  schemaValid: true,
  failures: [],
  promptTokens: 10,
  completionTokens: 5,
  judgePromptTokens: 0,
  judgeCompletionTokens: 0,
  latencyMs: 120,
  toolCalls: 0,
  iterations: 0,
  calls: [call()],
  judgeCalls: [],
  ...overrides,
});

const meta: RunMetadata = {
  commit: 'abc1234',
  startedAt: new Date('2026-11-11T22:30:00.000Z'),
  judge: 'openai:judge-x',
};

const fakeGateway = () => {
  const gateway: LangfuseGateway = {
    upsertDataset: vi.fn(async () => undefined),
    upsertItems: vi.fn(async () => undefined),
    runExperiment: vi.fn(async () => ({ url: 'https://cloud.langfuse.com/run/1' })),
  };
  return gateway;
};

describe('buildRunName', () => {
  it('is the target label, the short commit and a timestamp with no colons', () => {
    expect(buildRunName('openai:gpt-x', meta)).toBe(
      'openai:gpt-x @ abc1234 @ 2026-11-11T22-30-00Z',
    );
  });
});

describe('publishRuns (JEF-550)', () => {
  it('upserts one dataset, with an item per case keyed by the case id', async () => {
    const gateway = fakeGateway();
    const runs: TargetRun[] = [
      {
        label: 'openai:gpt-x',
        results: [result(), result({ caseId: 'chat-lookup', feature: 'chat', prompt: 'chat@2' })],
      },
    ];

    await publishRuns(gateway, runs, meta);

    expect(gateway.upsertDataset).toHaveBeenCalledOnce();
    expect(gateway.upsertDataset).toHaveBeenCalledWith('trakwyn-evals');
    expect(gateway.upsertItems).toHaveBeenCalledWith('trakwyn-evals', [
      {
        id: 'job-clean',
        input: [{ role: 'user', content: 'Parse this posting' }],
        metadata: { feature: 'jobDescription', prompt: 'parseJobDescription@3' },
      },
      {
        id: 'chat-lookup',
        input: [{ role: 'user', content: 'Parse this posting' }],
        metadata: { feature: 'chat', prompt: 'chat@2' },
      },
    ]);
  });

  it('shares one dataset item per case across targets', async () => {
    const gateway = fakeGateway();
    const runs: TargetRun[] = [
      { label: 'a:one', results: [result()] },
      { label: 'b:two', results: [result({ outcome: 'fail', passed: false, failures: ['x'] })] },
    ];

    await publishRuns(gateway, runs, meta);

    const items = vi.mocked(gateway.upsertItems).mock.calls[0]?.[1];
    expect(items).toHaveLength(1);
    expect(gateway.runExperiment).toHaveBeenCalledTimes(2);
  });

  it('starts one dataset run per target, named and described from the target', async () => {
    const gateway = fakeGateway();
    const runs: TargetRun[] = [
      { label: 'openai:gpt-x', results: [result()] },
      { label: 'anthropic:default', results: [result()] },
    ];

    const published = await publishRuns(gateway, runs, meta);

    const [first, second] = vi.mocked(gateway.runExperiment).mock.calls.map(([run]) => run);
    expect(first).toMatchObject({
      datasetName: 'trakwyn-evals',
      runName: 'openai:gpt-x @ abc1234 @ 2026-11-11T22-30-00Z',
      metadata: { target: 'openai:gpt-x', judge: 'openai:judge-x', commit: 'abc1234' },
    });
    expect(second?.runName).toContain('anthropic:default');
    expect(published).toEqual([
      { label: 'openai:gpt-x', url: 'https://cloud.langfuse.com/run/1' },
      { label: 'anthropic:default', url: 'https://cloud.langfuse.com/run/1' },
    ]);
  });

  it('scores passed and schema_valid per case, with the failures as the passed comment', async () => {
    const gateway = fakeGateway();
    const failed = result({
      caseId: 'job-bad',
      outcome: 'fail',
      passed: false,
      schemaValid: false,
      failures: ['title missing', 'reply was not valid: nope'],
    });

    await publishRuns(gateway, [{ label: 't:m', results: [result(), failed] }], meta);

    const run = vi.mocked(gateway.runExperiment).mock.calls[0]?.[0];
    expect(run?.items.map((item) => [item.caseId, item.scores])).toEqual([
      [
        'job-clean',
        [
          { name: 'passed', value: true, dataType: 'BOOLEAN', comment: undefined },
          { name: 'schema_valid', value: true, dataType: 'BOOLEAN' },
        ],
      ],
      [
        'job-bad',
        [
          {
            name: 'passed',
            value: false,
            dataType: 'BOOLEAN',
            comment: 'title missing\nreply was not valid: nope',
          },
          { name: 'schema_valid', value: false, dataType: 'BOOLEAN' },
        ],
      ],
    ]);
  });

  it('adds tool_calls and iterations for chat cases only', async () => {
    const gateway = fakeGateway();
    const chat = result({
      caseId: 'chat-lookup',
      feature: 'chat',
      toolCalls: 3,
      iterations: 2,
    });

    await publishRuns(gateway, [{ label: 't:m', results: [result(), chat] }], meta);

    const items = vi.mocked(gateway.runExperiment).mock.calls[0]?.[0].items ?? [];
    const names = (caseId: string) =>
      items.find((item) => item.caseId === caseId)?.scores.map((score) => score.name);
    expect(names('job-clean')).toEqual(['passed', 'schema_valid']);
    expect(names('chat-lookup')).toEqual(['passed', 'schema_valid', 'tool_calls', 'iterations']);
    expect(items[1]?.scores.slice(2)).toEqual([
      { name: 'tool_calls', value: 3, dataType: 'NUMERIC' },
      { name: 'iterations', value: 2, dataType: 'NUMERIC' },
    ]);
  });

  it('hands over the model and judge calls of each case for the trace', async () => {
    const gateway = fakeGateway();
    const judgeCall = call({ output: '{"claims":[]}' });
    const withJudge = result({
      calls: [call(), call({ output: 'second' })],
      judgeCalls: [judgeCall],
    });

    await publishRuns(gateway, [{ label: 't:m', results: [withJudge] }], meta);

    const item = vi.mocked(gateway.runExperiment).mock.calls[0]?.[0].items[0];
    expect(item?.calls).toHaveLength(2);
    expect(item?.judgeCalls).toEqual([judgeCall]);
    expect(item?.output).toBe('second');
  });

  it('takes the last reply that was not an error as the case output', async () => {
    const gateway = fakeGateway();
    const failing = result({
      calls: [call({ output: 'good' }), call({ output: null, error: 'boom' })],
    });

    await publishRuns(gateway, [{ label: 't:m', results: [failing] }], meta);

    expect(vi.mocked(gateway.runExperiment).mock.calls[0]?.[0].items[0]?.output).toBe('good');
  });

  it('marks calls served from the cache when the run says so', async () => {
    const gateway = fakeGateway();
    const runs: TargetRun[] = [
      { label: 't:m', results: [result()], cache: { hits: 1, misses: 0 } },
    ];

    await publishRuns(gateway, runs, meta);

    expect(vi.mocked(gateway.runExperiment).mock.calls[0]?.[0].metadata).toMatchObject({
      cacheHits: 1,
      cacheMisses: 0,
    });
  });

  it('publishes nothing for a run with no results', async () => {
    const gateway = fakeGateway();

    const published = await publishRuns(gateway, [{ label: 't:m', results: [] }], meta);

    expect(gateway.upsertItems).not.toHaveBeenCalled();
    expect(gateway.runExperiment).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it('lets a gateway failure reach the caller, which decides what it means', async () => {
    const gateway = fakeGateway();
    vi.mocked(gateway.upsertDataset).mockRejectedValue(new Error('401 unauthorized'));

    await expect(
      publishRuns(gateway, [{ label: 't:m', results: [result()] }], meta),
    ).rejects.toThrow('401 unauthorized');
  });
});
