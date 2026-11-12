import { describe, expect, it, vi } from 'vitest';
import { publishToLangfuse } from '#src/evals/publish/publishToLangfuse.js';
import type { LangfuseGateway } from '#src/evals/publish/langfusePublisher.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult, LangfuseConfig } from '#src/evals/types.js';

const config: LangfuseConfig = {
  publicKey: 'pk-lf-test',
  secretKey: 'sk-lf-test',
  baseUrl: 'https://cloud.langfuse.com',
};

const result: CaseResult = {
  caseId: 'job-clean',
  feature: 'jobDescription',
  prompt: 'parseJobDescription@3',
  outcome: 'pass',
  passed: true,
  schemaValid: true,
  failures: [],
  promptTokens: 1,
  completionTokens: 1,
  judgePromptTokens: 0,
  judgeCompletionTokens: 0,
  latencyMs: 1,
  toolCalls: 0,
  iterations: 0,
  calls: [],
  judgeCalls: [],
};

const runs: TargetRun[] = [{ label: 'openai:gpt-x', results: [result] }];

const setup = (overrides: Partial<LangfuseGateway> = {}) => {
  const gateway: LangfuseGateway = {
    upsertDataset: vi.fn(async () => undefined),
    upsertItems: vi.fn(async () => undefined),
    runExperiment: vi.fn(async () => ({ url: 'https://cloud.langfuse.com/p/1/runs/2' })),
    ...overrides,
  };
  const close = vi.fn(async () => undefined);
  const log = vi.fn();
  const logError = vi.fn();
  const deps = {
    createSession: vi.fn(async () => ({ gateway, close })),
    commit: () => 'abc1234',
    now: () => new Date('2026-11-11T22:30:00.000Z'),
    log,
    logError,
  };
  return { gateway, close, log, logError, deps };
};

describe('publishToLangfuse (JEF-550)', () => {
  it('uploads the runs, prints each run URL and closes the session', async () => {
    const { gateway, close, log, deps } = setup();

    const ok = await publishToLangfuse(config, runs, 'openai:judge-x', deps);

    expect(ok).toBe(true);
    expect(gateway.runExperiment).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('https://cloud.langfuse.com/p/1/runs/2'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('openai:gpt-x'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('records the commit and judge on the runs', async () => {
    const { gateway, deps } = setup();

    await publishToLangfuse(config, runs, 'openai:judge-x', deps);

    expect(vi.mocked(gateway.runExperiment).mock.calls[0]?.[0]).toMatchObject({
      runName: 'openai:gpt-x @ abc1234 @ 2026-11-11T22-30-00Z',
      metadata: { commit: 'abc1234', judge: 'openai:judge-x' },
    });
  });

  it('logs a gateway failure and returns false instead of throwing, and still closes', async () => {
    const { close, logError, deps } = setup({
      upsertDataset: vi.fn(async () => {
        throw new Error('401 unauthorized');
      }),
    });

    const ok = await publishToLangfuse(config, runs, null, deps);

    expect(ok).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('401 unauthorized'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('logs a failure to start the session and returns false', async () => {
    const { logError, deps } = setup();
    deps.createSession.mockRejectedValue(new Error('cannot load the SDK'));

    const ok = await publishToLangfuse(config, runs, null, deps);

    expect(ok).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('cannot load the SDK'));
  });

  it('survives a failing flush on close', async () => {
    const { close, logError, deps } = setup();
    close.mockRejectedValue(new Error('flush timed out'));

    const ok = await publishToLangfuse(config, runs, null, deps);

    expect(ok).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('flush timed out'));
  });

  it('never prints the keys', async () => {
    const { log, logError, deps } = setup({
      upsertDataset: vi.fn(async () => {
        throw new Error('bad request');
      }),
    });

    await publishToLangfuse(config, runs, null, deps);

    const printed = JSON.stringify([...log.mock.calls, ...logError.mock.calls]);
    expect(printed).not.toContain('sk-lf-test');
    expect(printed).not.toContain('pk-lf-test');
  });
});
