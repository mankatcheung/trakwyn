import type { CronAuthMethod } from '#src/http/routes/cronAuth.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/**
 * What a run acted on. `processed` is whatever the job's unit of work is —
 * applications purged, digests sent, reminders sent, notifications delivered —
 * and `failed` the items it could not finish but kept going past, so a partial
 * run is not reported as a clean one.
 *
 * Both come from the count the use case already returned. Nothing is recounted
 * here: the route has no view of what the use case skipped or retried.
 */
export interface ScheduledJobCounts {
  processed: number;
  failed: number;
}

export type ScheduledJobOutcome<T> =
  { status: 'completed'; result: T } | { status: 'failed'; error: unknown };

interface RunScheduledJobOptions<T> {
  /** One of `ADMIN_JOBS`. */
  job: string;
  auth: CronAuthMethod;
  logger: ILogger;
  execute: () => Promise<T>;
  summarize: (result: T) => ScheduledJobCounts;
}

/**
 * Times one `/admin/*` run and logs a single summary line for it (JEF-352).
 *
 * Since the jobs moved out of the process (JEF-335) they only run when an
 * external trigger reaches the API, and until this existed a successful run
 * left no record at all — so a scheduler that stopped firing, or an OIDC token
 * rejected before the handler ran, looked exactly like a quiet week. One
 * `info` line per run is what makes the absence of one meaningful.
 *
 * All four routes go through here so the shape is identical across them and a
 * dashboard can group on `job` without special-casing any of them.
 */
export async function runScheduledJob<T>({
  job,
  auth,
  logger,
  execute,
  summarize,
}: RunScheduledJobOptions<T>): Promise<ScheduledJobOutcome<T>> {
  const startedAt = Date.now();

  try {
    const result = await execute();
    const event = `job.${job}.completed`;
    logger.info(event, {
      event,
      job,
      auth,
      durationMs: Date.now() - startedAt,
      ...summarize(result),
    });
    return { status: 'completed', result };
  } catch (error) {
    logger.error(`Scheduled job ${job} failed`, error, {
      event: `job.${job}.failed`,
      job,
      auth,
      durationMs: Date.now() - startedAt,
    });
    return { status: 'failed', error };
  }
}

/**
 * The 503 path: the route is reachable but nothing is configured to authorize
 * a caller, so no trigger could ever get past it. That is a misconfiguration
 * whose only symptom would otherwise be the same silence as a job that never
 * fired, which is exactly what these lines exist to tell apart.
 *
 * `reason` is a short stable token rather than the sentence sent to the
 * caller, so it can be grouped on. Nothing was thrown — the route refused the
 * request on purpose — so the `err` argument is empty and the facts are all
 * in the fields.
 */
export function logScheduledJobMisconfigured(logger: ILogger, job: string, reason: string): void {
  const event = `job.${job}.misconfigured`;
  logger.warn(event, undefined, { event, job, reason });
}
