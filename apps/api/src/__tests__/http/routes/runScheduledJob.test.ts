import { describe, expect, it } from 'vitest';
import { logScheduledJobMisconfigured, runScheduledJob } from '#src/http/routes/runScheduledJob.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('runScheduledJob', () => {
  it('logs one completed line carrying the counts the use case returned', async () => {
    const logger = makeLogger();

    const outcome = await runScheduledJob({
      job: 'trash_purge',
      auth: 'oidc',
      logger,
      execute: () => Promise.resolve({ purged: 7, failed: 2 }),
      summarize: ({ purged, failed }) => ({ processed: purged, failed }),
    });

    expect(outcome).toEqual({ status: 'completed', result: { purged: 7, failed: 2 } });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'job.trash_purge.completed',
      expect.objectContaining({
        job: 'trash_purge',
        auth: 'oidc',
        processed: 7,
        failed: 2,
        durationMs: expect.any(Number) as number,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('records which auth path admitted the caller', async () => {
    const logger = makeLogger();

    await runScheduledJob({
      job: 'digest',
      auth: 'secret',
      logger,
      execute: () => Promise.resolve({ sent: 1, failed: 0 }),
      summarize: ({ sent, failed }) => ({ processed: sent, failed }),
    });

    expect(logger.info).toHaveBeenCalledWith(
      'job.digest.completed',
      expect.objectContaining({ auth: 'secret' }),
    );
  });

  it('logs a failed line with the error instead, and reports the failure', async () => {
    const logger = makeLogger();
    const error = new Error('boom');

    const outcome = await runScheduledJob({
      job: 'reminders',
      auth: 'oidc',
      logger,
      execute: () => Promise.reject(error),
      summarize: () => ({ processed: 0, failed: 0 }),
    });

    expect(outcome).toEqual({ status: 'failed', error });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Scheduled job reminders failed',
      error,
      expect.objectContaining({
        event: 'job.reminders.failed',
        job: 'reminders',
        auth: 'oidc',
        durationMs: expect.any(Number) as number,
      }),
    );
  });

  it('reports a run that finished with per-item failures as completed', async () => {
    const logger = makeLogger();

    // The use cases keep going past an individual failure by design, so the
    // run itself succeeded — `failed` is what tells a partial run apart, not
    // the outcome status.
    const outcome = await runScheduledJob({
      job: 'push_notifications',
      auth: 'secret',
      logger,
      execute: () => Promise.resolve({ delivered: 3, failed: 1 }),
      summarize: ({ delivered, failed }) => ({ processed: delivered, failed }),
    });

    expect(outcome.status).toBe('completed');
    expect(logger.info).toHaveBeenCalledWith(
      'job.push_notifications.completed',
      expect.objectContaining({ processed: 3, failed: 1 }),
    );
  });
});

describe('logScheduledJobMisconfigured', () => {
  it('warns with a groupable reason rather than the message sent to the caller', () => {
    const logger = makeLogger();

    logScheduledJobMisconfigured(logger, 'push_notifications', 'vapid_keys_missing');

    expect(logger.warn).toHaveBeenCalledWith('job.push_notifications.misconfigured', {
      job: 'push_notifications',
      reason: 'vapid_keys_missing',
    });
  });
});
