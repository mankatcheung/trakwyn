import { loadRunFolder, type LoadedRun } from '#src/evals/publish/loadRunFolder.js';
import { formatTranscript, unknownCaseIds } from '#src/evals/show/formatTranscript.js';

export const SHOWN_OK = 0;
export const SHOW_REFUSED = 2;

export interface ShowSavedDeps {
  load(dir: string): LoadedRun;
  log(message: string): void;
  logError(message: string): void;
}

const defaultDeps: ShowSavedDeps = {
  load: loadRunFolder,
  log: (message) => console.log(message),
  logError: (message) => console.error(message),
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * `--show <run-dir> [--case <id>]`: prints a saved run's transcripts
 * as readable text, so nobody has to `gzip -dc | jq` them. Calls no model.
 * Returns the exit status: 0 printed, 2 the folder is unreadable or a
 * `--case` id is in no target.
 */
export function showSavedRun(
  dir: string,
  caseIds: readonly string[],
  deps: ShowSavedDeps = defaultDeps,
): number {
  let loaded: LoadedRun;
  try {
    loaded = deps.load(dir);
  } catch (error: unknown) {
    deps.logError(messageOf(error));
    return SHOW_REFUSED;
  }

  const unknown = unknownCaseIds(loaded.runs, caseIds);
  if (unknown.length > 0) {
    const available = [...new Set(loaded.runs.flatMap((run) => run.results.map((r) => r.caseId)))];
    deps.logError(
      `No case ${unknown.join(', ')} in ${dir}. Cases in this run: ${available.join(', ')}`,
    );
    return SHOW_REFUSED;
  }

  deps.log(
    [
      `Run ${dir}`,
      `commit ${loaded.commit} · started ${loaded.startedAt.toISOString()} · judge ${loaded.judge ?? 'none'}`,
      '',
      formatTranscript(loaded.runs, caseIds),
    ].join('\n'),
  );
  return SHOWN_OK;
}
