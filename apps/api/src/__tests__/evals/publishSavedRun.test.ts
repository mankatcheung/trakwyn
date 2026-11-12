import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRunFolder } from '#src/evals/publish/loadRunFolder.js';
import type { LangfuseGateway, RunInput } from '#src/evals/publish/langfusePublisher.js';
import {
  publishSavedRun,
  PUBLISHED_OK,
  PUBLISH_FAILED,
  PUBLISH_REFUSED,
  type PublishSavedDeps,
} from '#src/evals/publish/publishSavedRun.js';
import { publishToLangfuse } from '#src/evals/publish/publishToLangfuse.js';
import { saveRunFolder } from '#src/evals/runFolder.js';
import { formatReport, type TargetRun } from '#src/evals/summary.js';
import type { CaseResult, EvalConfig, LangfuseConfig, RecordedCall } from '#src/evals/types.js';

const LANGFUSE_CONFIG: LangfuseConfig = {
  publicKey: 'pk-lf-test',
  secretKey: 'sk-lf-test',
  baseUrl: 'https://cloud.langfuse.com',
};
const ORIGINAL_START = 1_762_900_000_000;

const call = (latencyMs: number, startedAt: number): RecordedCall => ({
  kind: 'complete',
  messages: [{ role: 'user', content: 'Parse this posting' }],
  output: '{"title":"Engineer"}',
  toolCalls: [],
  promptTokens: 10,
  completionTokens: 5,
  latencyMs,
  startedAt,
  error: null,
});

const result = (caseId: string): CaseResult => ({
  caseId,
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
  latencyMs: 1234,
  toolCalls: 0,
  iterations: 0,
  calls: [call(1234, ORIGINAL_START)],
  judgeCalls: [call(321, ORIGINAL_START + 2000)],
});

const config: EvalConfig = {
  targets: [{ provider: 'custom', model: 'org/model@v1', apiKey: 'sk-x', baseUrl: null }],
  judge: { provider: 'openai', model: 'judge-1', apiKey: 'sk-x', baseUrl: null },
  validateJudge: false,
  caseIds: [],
  cache: true,
  refresh: false,
  minPassRate: 0.8,
  maxErrorRate: 0.1,
  reportFile: null,
  publish: null,
  publishFrom: null,
  show: null,
  label: null,
  save: true,
};

const runs: TargetRun[] = [
  {
    label: 'custom:org/model@v1',
    results: [result('job-a'), result('job-b')],
    cache: { hits: 1, misses: 1 },
  },
  { label: 'custom:org/model@v1', results: [result('job-c')], skipped: 2 },
];

const STARTED = new Date('2026-11-12T10:30:45.000Z');

describe('loadRunFolder and publishSavedRun (JEF-562)', () => {
  let base: string;
  let dir: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'eval-publish-'));
    dir = saveRunFolder(base, {
      config,
      runs,
      report: formatReport(runs),
      caseIds: ['job-a', 'job-b', 'job-c'],
      commit: 'ab12cd3',
      startedAt: STARTED,
      finishedAt: new Date('2026-11-12T10:41:00.000Z'),
      exitCode: 0,
    });
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  const fake = () => {
    const runExperiment = vi.fn(async (_run: RunInput) => ({ url: 'https://lf/run/1' }));
    const gateway: LangfuseGateway = {
      upsertDataset: vi.fn(async () => undefined),
      upsertItems: vi.fn(async () => undefined),
      runExperiment,
    };
    const log = vi.fn();
    const logError = vi.fn();
    const close = vi.fn(async () => undefined);
    const createSession = vi.fn(async () => ({ gateway, close }));
    const deps: PublishSavedDeps = {
      load: loadRunFolder,
      // The real publisher, over the fake gateway, with today's clock and commit
      // that must not leak into an old run.
      publish: (cfg, r, judge, _deps, recorded) =>
        publishToLangfuse(
          cfg,
          r,
          judge,
          {
            createSession,
            commit: () => 'TODAY00',
            now: () => new Date('2030-01-01T00:00:00.000Z'),
            log,
            logError,
          },
          recorded,
        ),
      markPublished: (d, record) => {
        const path = join(d, 'run.json');
        writeFileSync(
          path,
          JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...record }),
        );
      },
      now: () => new Date('2026-11-13T09:00:00.000Z'),
      log,
      logError,
    };
    return { deps, runExperiment, createSession, logError };
  };

  it('round-trips the runs a folder was saved with', () => {
    const loaded = loadRunFolder(dir);

    expect(loaded.commit).toBe('ab12cd3');
    expect(loaded.startedAt).toEqual(STARTED);
    expect(loaded.judge).toBe('openai:judge-1');
    expect(loaded.publishedAt).toBeNull();
    expect(loaded.runs).toEqual(runs);
  });

  it('names the path when a file is missing or unreadable', () => {
    expect(() => loadRunFolder(join(base, 'nope'))).toThrow(join(base, 'nope', 'run.json'));

    const broken = join(base, 'broken');
    mkdirSync(join(broken, 'transcripts'), { recursive: true });
    writeFileSync(join(broken, 'run.json'), '{not json');
    expect(() => loadRunFolder(broken)).toThrow(/run\.json is not valid JSON/);

    rmSync(join(dir, 'transcripts'), { recursive: true });
    expect(() => loadRunFolder(dir)).toThrow(join(dir, 'transcripts'));
  });

  it('uploads with the folder commit, start time and original latencies', async () => {
    const { deps, runExperiment } = fake();

    const code = await publishSavedRun({ dir, langfuse: LANGFUSE_CONFIG, force: false }, deps);

    expect(code).toBe(PUBLISHED_OK);
    const first = runExperiment.mock.calls[0]?.[0] as RunInput;
    expect(first.runName).toBe('custom:org/model@v1 @ ab12cd3 @ 2026-11-12T10-30-45Z');
    expect(first.metadata.commit).toBe('ab12cd3');
    expect(first.judgeModel).toBe('openai:judge-1');
    expect(first.items[0]?.calls[0]).toMatchObject({
      latencyMs: 1234,
      startedAt: ORIGINAL_START,
    });
    expect(first.items[0]?.judgeCalls[0]?.latencyMs).toBe(321);
  });

  it('records the upload in run.json and refuses a second one without --force', async () => {
    const { deps, runExperiment, createSession, logError } = fake();
    await publishSavedRun({ dir, langfuse: LANGFUSE_CONFIG, force: false }, deps);

    const record = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    expect(record.publishedAt).toBe('2026-11-13T09:00:00.000Z');
    expect(record.langfuseRuns[0]).toContain('ab12cd3');
    expect(record.commit).toBe('ab12cd3');

    const calls = runExperiment.mock.calls.length;
    const sessions = createSession.mock.calls.length;
    const again = await publishSavedRun({ dir, langfuse: LANGFUSE_CONFIG, force: false }, deps);

    expect(again).toBe(PUBLISH_REFUSED);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('--force'));
    expect(runExperiment.mock.calls.length).toBe(calls);
    expect(createSession.mock.calls.length).toBe(sessions);

    const forced = await publishSavedRun({ dir, langfuse: LANGFUSE_CONFIG, force: true }, deps);
    expect(forced).toBe(PUBLISHED_OK);
    expect(runExperiment.mock.calls.length).toBeGreaterThan(calls);
  });

  it('leaves the folder unmarked when the upload fails', async () => {
    const { deps } = fake();
    const failing = { ...deps, publish: async () => false };

    const code = await publishSavedRun({ dir, langfuse: LANGFUSE_CONFIG, force: false }, failing);

    expect(code).toBe(PUBLISH_FAILED);
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).publishedAt).toBeUndefined();
  });

  it('exits as refused when the folder cannot be read', async () => {
    const { deps, logError } = fake();

    const code = await publishSavedRun(
      { dir: join(base, 'missing'), langfuse: LANGFUSE_CONFIG, force: false },
      deps,
    );

    expect(code).toBe(PUBLISH_REFUSED);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('missing'));
  });
});
