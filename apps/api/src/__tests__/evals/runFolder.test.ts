import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveRunFolder, type RunFolderInput } from '#src/evals/runFolder.js';
import { formatReport, type TargetRun } from '#src/evals/summary.js';
import type { CaseResult, EvalConfig, RecordedCall } from '#src/evals/types.js';

const KEY = 'sk-super-secret-key-1234';
const BASE_URL_TOKEN = 'url-token-9876';

const call = (output: string): RecordedCall => ({
  kind: 'complete',
  messages: [{ role: 'user', content: 'Parse this posting' }],
  output,
  toolCalls: [],
  promptTokens: 10,
  completionTokens: 5,
  latencyMs: 80,
  startedAt: 1_762_900_000_000,
  error: null,
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
  judgePromptTokens: 2,
  judgeCompletionTokens: 1,
  latencyMs: 120,
  toolCalls: 0,
  iterations: 0,
  calls: [call('{"title":"Engineer"}'), call('ünïcode "quoted"\nnewline')],
  judgeCalls: [call('{"score":5}')],
  ...overrides,
});

const config = (overrides: Partial<EvalConfig> = {}): EvalConfig => ({
  targets: [
    {
      provider: 'custom',
      model: 'org/model@v1',
      apiKey: KEY,
      baseUrl: `https://host/v1/chat/completions?token=${BASE_URL_TOKEN}`,
    },
  ],
  judge: { provider: 'openai', model: 'judge-1', apiKey: KEY, baseUrl: null },
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
  ...overrides,
});

const runs = (extra: Partial<TargetRun> = {}): TargetRun[] => [
  {
    label: 'custom:org/model@v1',
    results: [
      result(),
      result({ caseId: 'job-2', outcome: 'fail', passed: false, failures: ['no title'] }),
    ],
    cache: { hits: 1, misses: 1 },
    ...extra,
  },
];

const input = (overrides: Partial<RunFolderInput> = {}): RunFolderInput => {
  const targetRuns = overrides.runs ?? runs();
  return {
    config: config(),
    runs: targetRuns,
    report: formatReport(targetRuns),
    caseIds: ['job-clean', 'job-2'],
    commit: 'ab12cd3',
    startedAt: new Date('2026-11-12T10:30:45.000Z'),
    finishedAt: new Date('2026-11-12T10:41:00.000Z'),
    exitCode: 1,
    ...overrides,
  };
};

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

describe('saveRunFolder', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'eval-runs-'));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('writes the run record, both summaries and a transcript per target', () => {
    const dir = saveRunFolder(join(base, 'nested', '.eval-runs'), input());

    expect(dir.endsWith('2026-11-12T1030Z-ab12cd3')).toBe(true);
    expect(readdirSync(dir).sort()).toEqual([
      'run.json',
      'summary.json',
      'summary.md',
      'transcripts',
    ]);
    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toBe(`${input().report}\n`);

    const run = readJson(join(dir, 'run.json'));
    expect(run).toMatchObject({
      commit: 'ab12cd3',
      startedAt: '2026-11-12T10:30:45.000Z',
      finishedAt: '2026-11-12T10:41:00.000Z',
      exitCode: 1,
      partial: false,
      judge: 'openai:judge-1',
      caseIds: ['job-clean', 'job-2'],
      flags: { cache: true, refresh: false, minPassRate: 0.8, maxErrorRate: 0.1, publish: false },
      targets: [
        {
          label: 'custom:org/model@v1',
          cases: 2,
          prompts: ['parseJobDescription@3'],
          cache: { hits: 1, misses: 1 },
        },
      ],
    });

    const summary = readJson(join(dir, 'summary.json'));
    expect(summary[0]).toMatchObject({ label: 'custom:org/model@v1', total: 2, passed: 1 });
  });

  it('names the folder with the label and never overwrites an earlier run', () => {
    const labelled = input({ config: config({ label: 'base line/1' }) });
    const first = saveRunFolder(base, labelled);
    const second = saveRunFolder(base, labelled);

    expect(first.endsWith('2026-11-12T1030Z-ab12cd3-base_line_1')).toBe(true);
    expect(second).not.toBe(first);
    expect(readdirSync(base)).toHaveLength(2);
    expect(readdirSync(first)).toContain('run.json');
    expect(readdirSync(second)).toContain('run.json');
  });

  it('reads the transcripts back as the same results, calls and judge calls included', () => {
    const targetRuns = runs();
    const dir = saveRunFolder(base, input({ runs: targetRuns }));

    const files = readdirSync(join(dir, 'transcripts'));
    expect(files).toEqual(['custom_org_model_v1.jsonl.gz']);
    const text = gunzipSync(readFileSync(join(dir, 'transcripts', files[0] as string))).toString();
    const lines = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toEqual(targetRuns[0]?.results);
  });

  it('keeps two targets with the same safe name apart', () => {
    const dir = saveRunFolder(
      base,
      input({ runs: [...runs(), ...runs({ label: 'custom:org/model@v1' })] }),
    );
    expect(readdirSync(join(dir, 'transcripts')).sort()).toEqual([
      'custom_org_model_v1-2.jsonl.gz',
      'custom_org_model_v1.jsonl.gz',
    ]);
  });

  it('puts no API key or base URL token in any file', () => {
    const dir = saveRunFolder(base, input());
    const files = [
      join(dir, 'run.json'),
      join(dir, 'summary.md'),
      join(dir, 'summary.json'),
      ...readdirSync(join(dir, 'transcripts')).map((name) => join(dir, 'transcripts', name)),
    ];

    for (const file of files) {
      const raw = readFileSync(file);
      const text = file.endsWith('.gz') ? gunzipSync(raw).toString() : raw.toString();
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(BASE_URL_TOKEN);
    }
  });

  it('marks the run partial when a target stopped on its quota', () => {
    const stopped = runs({
      results: [result({ outcome: 'error', passed: false, quotaStop: true })],
      skipped: 4,
    });
    const dir = saveRunFolder(base, input({ runs: stopped, exitCode: 3 }));

    const run = readJson(join(dir, 'run.json'));
    expect(run.partial).toBe(true);
    expect(run.exitCode).toBe(3);
    expect(run.targets[0]).toMatchObject({ skipped: 4, quotaStop: true });
  });
});
