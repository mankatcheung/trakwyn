import { buildRunName } from '#src/evals/publish/langfusePublisher.js';
import { loadRunFolder, markPublished, type LoadedRun } from '#src/evals/publish/loadRunFolder.js';
import { publishToLangfuse } from '#src/evals/publish/publishToLangfuse.js';
import type { PublishFromConfig } from '#src/evals/types.js';

export const PUBLISHED_OK = 0;
export const PUBLISH_FAILED = 1;
export const PUBLISH_REFUSED = 2;

export interface PublishSavedDeps {
  load(dir: string): LoadedRun;
  publish: typeof publishToLangfuse;
  markPublished: typeof markPublished;
  now(): Date;
  log(message: string): void;
  logError(message: string): void;
}

const defaultDeps: PublishSavedDeps = {
  load: loadRunFolder,
  publish: publishToLangfuse,
  markPublished,
  now: () => new Date(),
  log: (message) => console.log(message),
  logError: (message) => console.error(message),
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * `--publish-from` (JEF-562): uploads a saved run folder as it happened, with
 * its own commit, start time and call timings, and makes no model or judge
 * call. Returns the exit status: 0 uploaded, 1 the upload failed, 2 the folder
 * is unreadable or was already published and `--force` was not given.
 */
export async function publishSavedRun(
  config: PublishFromConfig,
  deps: PublishSavedDeps = defaultDeps,
): Promise<number> {
  let loaded: LoadedRun;
  try {
    loaded = deps.load(config.dir);
  } catch (error: unknown) {
    deps.logError(messageOf(error));
    return PUBLISH_REFUSED;
  }

  if (loaded.publishedAt && !config.force) {
    deps.logError(
      `${config.dir} was already published at ${loaded.publishedAt}. Publishing it again makes a second, identical run in Langfuse; pass --force to do it anyway.`,
    );
    return PUBLISH_REFUSED;
  }

  const meta = { commit: loaded.commit, startedAt: loaded.startedAt };
  const ok = await deps.publish(
    config.langfuse,
    loaded.runs,
    loaded.judge,
    loaded.maxErrorRate,
    undefined,
    meta,
  );
  if (!ok) return PUBLISH_FAILED;

  try {
    deps.markPublished(config.dir, {
      publishedAt: deps.now().toISOString(),
      langfuseRuns: loaded.runs
        .filter((run) => run.results.length > 0)
        .map((run) =>
          buildRunName(run.label, {
            ...meta,
            judge: loaded.judge,
            maxErrorRate: loaded.maxErrorRate,
          }),
        ),
    });
  } catch (error: unknown) {
    deps.logError(
      `Uploaded, but could not record it in ${config.dir}/run.json: ${messageOf(error)}`,
    );
  }
  return PUBLISHED_OK;
}
