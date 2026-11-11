import { execFileSync } from 'node:child_process';
import { publishRuns, type LangfuseGateway } from '#src/evals/publish/langfusePublisher.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { LangfuseConfig } from '#src/evals/types.js';

export interface PublishDeps {
  createSession(
    config: LangfuseConfig,
  ): Promise<{ gateway: LangfuseGateway; close(): Promise<void> }>;
  commit(): string;
  now(): Date;
  log(message: string): void;
  logError(message: string): void;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The short SHA the run was made from; `unknown` outside a checkout or without git. */
function gitShortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

const defaultDeps: PublishDeps = {
  // Loaded here, not at the top of the file, so a run without `--publish` never
  // loads the SDK or its OpenTelemetry setup.
  createSession: async (config) => {
    const { createLangfuseSession } = await import('#src/evals/publish/langfuseGateway.js');
    return createLangfuseSession(config);
  },
  commit: gitShortSha,
  now: () => new Date(),
  log: (message) => console.log(message),
  logError: (message) => console.error(message),
};

/**
 * Uploads the finished runs to Langfuse (`--publish`, JEF-550). It never
 * throws: the report is already printed and written, and a Langfuse outage or
 * a bad key says nothing about the prompts, so it must not change the exit
 * code. Returns whether everything was uploaded and flushed. Nothing printed
 * here includes a key.
 */
export async function publishToLangfuse(
  config: LangfuseConfig,
  runs: TargetRun[],
  judge: string | null,
  deps: PublishDeps = defaultDeps,
): Promise<boolean> {
  let session: Awaited<ReturnType<PublishDeps['createSession']>>;
  try {
    session = await deps.createSession(config);
  } catch (error: unknown) {
    deps.logError(`Could not publish to Langfuse: ${messageOf(error)}`);
    return false;
  }

  let ok = true;
  try {
    const published = await publishRuns(session.gateway, runs, {
      commit: deps.commit(),
      startedAt: deps.now(),
      judge,
    });
    for (const run of published) {
      deps.log(`Published ${run.label} to Langfuse${run.url ? `: ${run.url}` : ''}`);
    }
  } catch (error: unknown) {
    ok = false;
    deps.logError(`Could not publish to Langfuse: ${messageOf(error)}`);
  }

  try {
    await session.close();
  } catch (error: unknown) {
    ok = false;
    deps.logError(`Langfuse did not flush everything: ${messageOf(error)}`);
  }
  return ok;
}
