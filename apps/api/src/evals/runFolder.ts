import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { targetLabel } from '#src/evals/buildProvider.js';
import { stoppedOnQuota, summarise, type TargetRun } from '#src/evals/summary.js';
import type { EvalConfig } from '#src/evals/types.js';

/** What a finished run hands over to be kept (JEF-560). */
export interface RunFolderInput {
  config: EvalConfig;
  runs: TargetRun[];
  /** The `formatReport` text, as `--out` writes it. */
  report: string;
  /** The ids of the cases the run selected. */
  caseIds: string[];
  commit: string;
  startedAt: Date;
  finishedAt: Date;
  exitCode: number;
}

const MAX_NAME_ATTEMPTS = 1000;

/** `2026-11-12T10:30:45.123Z` becomes `2026-11-12T1030Z`. */
const stamp = (date: Date): string => `${date.toISOString().slice(0, 16).replace(':', '')}Z`;

/** Keeps a label usable as one path segment: target labels carry `:`, `/` and `@`. */
const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, '_');

/**
 * Creates the run's own folder under `baseDir`. `mkdir` without `recursive`
 * fails on an existing name, so a clash takes the next suffix instead of
 * reusing, and therefore overwriting, an earlier run.
 */
function createRunDir(baseDir: string, input: RunFolderInput): string {
  mkdirSync(baseDir, { recursive: true });
  const label = input.config.label ? `-${safeName(input.config.label)}` : '';
  const name = `${stamp(input.startedAt)}-${safeName(input.commit)}${label}`;

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const dir = join(baseDir, attempt === 1 ? name : `${name}-${attempt}`);
    try {
      mkdirSync(dir);
      return dir;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`No free run folder name starting with ${name} in ${baseDir}`);
}

/**
 * How the run was made. Built from labels, never by spreading a target or the
 * config: those carry API keys, and a base URL can carry a token.
 */
function runRecord(input: RunFolderInput) {
  const { config, runs } = input;
  return {
    commit: input.commit,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    exitCode: input.exitCode,
    partial: runs.some(stoppedOnQuota),
    flags: {
      label: config.label,
      cache: config.cache,
      refresh: config.refresh,
      minPassRate: config.minPassRate,
      maxErrorRate: config.maxErrorRate,
      reportFile: config.reportFile,
      publish: config.publish !== null,
      validateJudge: config.validateJudge,
    },
    judge: config.judge ? targetLabel(config.judge) : null,
    caseIds: input.caseIds,
    targets: runs.map((run) => ({
      label: run.label,
      cases: run.results.length,
      skipped: run.skipped ?? 0,
      prompts: [...new Set(run.results.map((result) => result.prompt))].sort(),
      cache: run.cache ?? null,
      quotaStop: stoppedOnQuota(run),
    })),
  };
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** One file name per target, even when two labels sanitise to the same text. */
function transcriptNames(runs: TargetRun[]): string[] {
  const seen = new Map<string, number>();
  return runs.map((run) => {
    const base = safeName(run.label);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${count === 1 ? base : `${base}-${count}`}.jsonl.gz`;
  });
}

/**
 * Keeps a finished run in a folder of its own so it outlives the terminal and
 * can be inspected, or published, later (JEF-560). Returns the folder. Throws
 * when it cannot write; the caller reports that without changing the exit code.
 */
export function saveRunFolder(baseDir: string, input: RunFolderInput): string {
  const dir = createRunDir(baseDir, input);

  writeFileSync(join(dir, 'run.json'), json(runRecord(input)));
  writeFileSync(join(dir, 'summary.md'), `${input.report}\n`);
  writeFileSync(
    join(dir, 'summary.json'),
    json(
      input.runs.map((run) => ({
        label: run.label,
        ...summarise(run.results),
        quotaStop: stoppedOnQuota(run),
      })),
    ),
  );

  const transcripts = join(dir, 'transcripts');
  mkdirSync(transcripts);
  const names = transcriptNames(input.runs);
  input.runs.forEach((run, index) => {
    const lines = run.results.map((result) => JSON.stringify(result)).join('\n');
    writeFileSync(join(transcripts, names[index] as string), gzipSync(`${lines}\n`));
  });
  return dir;
}
