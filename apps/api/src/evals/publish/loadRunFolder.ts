import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { transcriptNames } from '#src/evals/runFolder.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult } from '#src/evals/types.js';

/** A saved run, read back (JEF-562): what `publishToLangfuse` needs, as the run really happened. */
export interface LoadedRun {
  dir: string;
  runs: TargetRun[];
  /** The judge's label, or null when the run had none. */
  judge: string | null;
  commit: string;
  startedAt: Date;
  /** When it was uploaded before, or null. */
  publishedAt: string | null;
}

/** What is written back into `run.json` after an upload. */
export interface PublishRecord {
  publishedAt: string;
  langfuseRuns: string[];
}

interface TargetRecord {
  label: string;
  skipped?: number;
  cache?: { hits: number; misses: number } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function readFile(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error: unknown) {
    throw new Error(`Cannot read ${path}: ${messageOf(error)}`);
  }
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(`${path} is not valid JSON: ${messageOf(error)}`);
  }
}

function readRunRecord(dir: string): Record<string, unknown> {
  const path = join(dir, 'run.json');
  const record = parseJson(path, readFile(path).toString('utf8'));
  if (!isRecord(record)) throw new Error(`${path} is not a run record`);
  return record;
}

function targetsOf(path: string, record: Record<string, unknown>): TargetRecord[] {
  const { targets } = record;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error(`${path} lists no targets`);
  }
  return targets.map((target: unknown) => {
    if (!isRecord(target) || typeof target.label !== 'string') {
      throw new Error(`${path} has a target without a label`);
    }
    return target as unknown as TargetRecord;
  });
}

function readTranscript(path: string): CaseResult[] {
  let text: string;
  try {
    text = gunzipSync(readFile(path)).toString('utf8');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Cannot read')) throw error;
    throw new Error(`${path} is not a gzip transcript: ${messageOf(error)}`);
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const result = parseJson(`${path} line ${index + 1}`, line);
      if (!isRecord(result) || typeof result.caseId !== 'string' || !Array.isArray(result.calls)) {
        throw new Error(`${path} line ${index + 1} is not a case result`);
      }
      return result as unknown as CaseResult;
    });
}

/**
 * Reads a run folder written by `saveRunFolder` (JEF-560) into the shapes the
 * Langfuse publisher takes. Throws a message naming the path that is missing
 * or unreadable. The recorded calls keep their original `startedAt` and
 * `latencyMs`, so nothing here invents a time.
 */
export function loadRunFolder(dir: string): LoadedRun {
  const record = readRunRecord(dir);
  const recordPath = join(dir, 'run.json');
  const targets = targetsOf(recordPath, record);

  const startedAt = new Date(String(record.startedAt));
  if (typeof record.commit !== 'string' || Number.isNaN(startedAt.getTime())) {
    throw new Error(`${recordPath} has no commit or start time`);
  }

  const names = transcriptNames(targets);
  const runs: TargetRun[] = targets.map((target, index) => ({
    label: target.label,
    results: readTranscript(join(dir, 'transcripts', names[index] as string)),
    ...(target.cache ? { cache: target.cache } : {}),
    ...(target.skipped ? { skipped: target.skipped } : {}),
  }));

  return {
    dir,
    runs,
    judge: typeof record.judge === 'string' ? record.judge : null,
    commit: record.commit,
    startedAt,
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null,
  };
}

/** Records the upload in the folder's `run.json`, keeping every other field. */
export function markPublished(dir: string, published: PublishRecord): void {
  const path = join(dir, 'run.json');
  const next = { ...readRunRecord(dir), ...published };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}
