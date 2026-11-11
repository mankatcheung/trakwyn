import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeReportFile } from '#src/evals/reportFile.js';
import { formatReport } from '#src/evals/summary.js';
import type { CaseResult } from '#src/evals/types.js';

const failed: CaseResult = {
  caseId: 'bad-case',
  feature: 'jobDescription',
  prompt: 'parseJobDescription@1',
  passed: false,
  schemaValid: true,
  failures: ['error: boom [HTTP 400, body: nope]'],
  promptTokens: 0,
  completionTokens: 0,
  judgePromptTokens: 0,
  judgeCompletionTokens: 0,
  latencyMs: 10,
  toolCalls: 0,
  iterations: 0,
  calls: [],
  judgeCalls: [],
};

describe('writeReportFile (JEF-542)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-report-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the whole report, failures included, creating missing folders', () => {
    const report = formatReport([{ label: 'openai:m', results: [failed] }]);
    const file = join(dir, 'nested', 'report.txt');

    writeReportFile(file, report);

    const written = readFileSync(file, 'utf8');
    expect(written).toBe(`${report}\n`);
    expect(written).toContain('Failures:');
    expect(written).toContain('[HTTP 400, body: nope]');
  });

  it('overwrites an earlier report', () => {
    const file = join(dir, 'report.txt');
    writeFileSync(file, 'old');

    writeReportFile(file, 'new');

    expect(readFileSync(file, 'utf8')).toBe('new\n');
  });

  it('throws when the path cannot be written', () => {
    const blocker = join(dir, 'file');
    writeFileSync(blocker, 'x');

    expect(() => writeReportFile(join(blocker, 'report.txt'), 'r')).toThrow();
  });
});
