import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRunFolder } from '#src/evals/publish/loadRunFolder.js';
import { saveRunFolder } from '#src/evals/runFolder.js';
import { formatTranscript } from '#src/evals/show/formatTranscript.js';
import {
  showSavedRun,
  SHOWN_OK,
  SHOW_REFUSED,
  type ShowSavedDeps,
} from '#src/evals/show/showSavedRun.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult, EvalConfig, RecordedCall } from '#src/evals/types.js';

const START = 1_762_900_000_000;

const call = (over: Partial<RecordedCall> = {}): RecordedCall => ({
  kind: 'complete',
  messages: [
    { role: 'system', content: 'You parse job postings.\nReturn JSON.' },
    { role: 'user', content: 'Posting: Senior Engineer at Acme' },
  ],
  output: '{"title":"Senior Engineer"}',
  toolCalls: [],
  promptTokens: 10,
  completionTokens: 5,
  latencyMs: 1234,
  startedAt: START,
  error: null,
  ...over,
});

const result = (caseId: string, over: Partial<CaseResult> = {}): CaseResult => ({
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
  calls: [call()],
  judgeCalls: [],
  ...over,
});

const runs: TargetRun[] = [
  {
    label: 'openai:gpt-x',
    results: [
      result('jd-standard'),
      result('jd-bad', {
        outcome: 'fail',
        passed: false,
        failures: ['title was empty'],
      }),
      result('jd-429', {
        outcome: 'error',
        passed: false,
        failures: ['error: HTTP 429'],
        calls: [call({ output: null, error: 'HTTP 429' })],
      }),
    ],
  },
];

describe('formatTranscript', () => {
  it('prints each case with its outcome, prompt, messages and reply', () => {
    const text = formatTranscript(runs, ['jd-standard']);

    expect(text).toContain('===== openai:gpt-x (1 of 3 cases) =====');
    expect(text).toContain('--- jd-standard · jobDescription · PASS ---');
    expect(text).toContain('prompt parseJobDescription@3 · 1234 ms · 10 in / 5 out');
    expect(text).toContain('Model call 1 of 1 (complete, 1234 ms, 10 in / 5 out, 2025-11-11');
    expect(text).toContain('  [system]\n    You parse job postings.\n    Return JSON.');
    expect(text).toContain('  [user]\n    Posting: Senior Engineer at Acme');
    expect(text).toContain('  [reply]\n    {"title":"Senior Engineer"}');
    expect(text).not.toContain('jd-bad');
  });

  it('prints every case when no id is given, with failures and errors apart', () => {
    const text = formatTranscript(runs, []);

    expect(text).toContain('(3 of 3 cases)');
    expect(text).toContain('Failures:\n  - title was empty');
    expect(text).toContain('Errors:\n  - error: HTTP 429');
    expect(text).toContain('[error] HTTP 429');
  });

  it('shows tool calls, tool results and judge calls', () => {
    const chat = result('chat-lookup', {
      feature: 'chat',
      toolCalls: 1,
      iterations: 2,
      judgePromptTokens: 7,
      judgeCompletionTokens: 3,
      calls: [
        call({
          kind: 'stream',
          output: null,
          toolCalls: [{ id: 't1', name: 'list_applications', arguments: { status: 'open' } }],
        }),
        call({
          kind: 'stream',
          messages: [
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 't1', name: 'list_applications', arguments: {} }],
            },
            { role: 'tool', toolCallId: 't1', content: '[{"id":"a1"}]' },
          ],
          output: 'You have one application.',
        }),
      ],
      judgeCalls: [call({ output: '{"claims":[]}' })],
    });

    const text = formatTranscript([{ label: 't', results: [chat] }], []);

    expect(text).toContain('1 tool calls, 2 iterations');
    expect(text).toContain('judge 7 in / 3 out');
    expect(text).toContain('-> list_applications({"status":"open"})  [t1]');
    expect(text).toContain('  [tool t1]\n    [{"id":"a1"}]');
    expect(text).toContain('Judge call 1 of 1');
  });

  it('says so when a case recorded no call', () => {
    const skipped = result('late', { outcome: 'skipped', passed: false, calls: [] });

    expect(formatTranscript([{ label: 't', results: [skipped] }], [])).toContain(
      '(no model call was recorded)',
    );
  });
});

describe('showSavedRun', () => {
  const deps = (over: Partial<ShowSavedDeps> = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    const real: ShowSavedDeps = {
      load: () => ({
        dir: 'd',
        runs,
        judge: 'openai:judge-1',
        commit: 'ab12cd3',
        startedAt: new Date(START),
        maxErrorRate: 0.1,
        publishedAt: null,
      }),
      log: (message) => out.push(message),
      logError: (message) => err.push(message),
      ...over,
    };
    return { real, out, err };
  };

  it('prints the header and the chosen case, and exits 0', () => {
    const { real, out } = deps();

    expect(showSavedRun('.eval-runs/x', ['jd-bad'], real)).toBe(SHOWN_OK);
    expect(out[0]).toContain('Run .eval-runs/x');
    expect(out[0]).toContain('commit ab12cd3');
    expect(out[0]).toContain('judge openai:judge-1');
    expect(out[0]).toContain('--- jd-bad');
    expect(out[0]).not.toContain('--- jd-standard');
  });

  it('refuses a case id that no target ran, and lists the ones that exist', () => {
    const { real, out, err } = deps();

    expect(showSavedRun('d', ['jd-typo'], real)).toBe(SHOW_REFUSED);
    expect(err[0]).toContain('No case jd-typo');
    expect(err[0]).toContain('jd-standard, jd-bad, jd-429');
    expect(out).toEqual([]);
  });

  it('refuses a folder that cannot be read', () => {
    const { real, err } = deps({
      load: () => {
        throw new Error('Cannot read d/run.json: ENOENT');
      },
    });

    expect(showSavedRun('d', [], real)).toBe(SHOW_REFUSED);
    expect(err).toEqual(['Cannot read d/run.json: ENOENT']);
  });
});

describe('showSavedRun on a real saved folder', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'eval-show-'));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('reads back what saveRunFolder wrote', () => {
    const config = {
      targets: [{ provider: 'openai', model: 'gpt-x', apiKey: 'sk-secret', baseUrl: null }],
      judge: null,
      validateJudge: false,
      caseIds: [],
      cache: false,
      refresh: false,
      minPassRate: 0.8,
      maxErrorRate: 0.1,
      reportFile: null,
      publish: null,
      publishFrom: null,
      show: null,
      label: null,
      save: true,
    } satisfies EvalConfig;
    const dir = saveRunFolder(base, {
      config,
      runs,
      report: 'report',
      caseIds: ['jd-standard'],
      commit: 'ab12cd3',
      startedAt: new Date(START),
      finishedAt: new Date(START + 1000),
      exitCode: 0,
    });
    const log = vi.fn();

    const status = showSavedRun(dir, ['jd-standard'], {
      load: loadRunFolder,
      log,
      logError: vi.fn(),
    });

    expect(status).toBe(SHOWN_OK);
    expect(log.mock.calls[0]?.[0]).toContain('--- jd-standard · jobDescription · PASS ---');
    expect(log.mock.calls[0]?.[0]).not.toContain('sk-secret');
  });
});
