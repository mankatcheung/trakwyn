import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { PinoLogger } from '#src/infrastructure/observability/PinoLogger.js';

function makePinoLogger() {
  const error = vi.fn();
  const warn = vi.fn();
  const info = vi.fn();
  const child = vi.fn(() => ({ info }) as unknown as FastifyBaseLogger);
  return {
    error,
    warn,
    info,
    child,
    logger: new PinoLogger({ error, warn, child } as unknown as FastifyBaseLogger),
  };
}

describe('PinoLogger', () => {
  it('serializes the error rather than handing pino the raw one', () => {
    const { error, logger } = makePinoLogger();
    const err = Object.assign(new Error('boom'), { params: ['someone@example.com'] });

    logger.error('Something failed', err);

    const [payload, message] = error.mock.calls[0] as [{ err: unknown }, string];
    expect(message).toBe('Something failed');
    expect(payload.err).not.toBe(err);
    expect(payload.err).not.toHaveProperty('params');
    expect(payload.err).toMatchObject({ name: 'Error', message: 'boom' });
    expect(JSON.stringify(payload)).not.toContain('someone@example.com');
  });

  it('logs the message alone when there is no error to attach', () => {
    const { error, logger } = makePinoLogger();

    logger.error('Refresh token reuse detected for session s_1 (user u_1)');

    expect(error).toHaveBeenCalledWith('Refresh token reuse detected for session s_1 (user u_1)');
  });

  it('serializes the error on warn too', () => {
    const { warn, logger } = makePinoLogger();
    const err = Object.assign(new Error('redis down'), { params: ['someone@example.com'] });

    logger.warn('Cache fail-open', err);

    const [payload, message] = warn.mock.calls[0] as [{ err: unknown }, string];
    expect(message).toBe('Cache fail-open');
    expect(payload.err).toMatchObject({ name: 'Error', message: 'redis down' });
    expect(JSON.stringify(payload)).not.toContain('someone@example.com');
  });

  it('logs a warn message alone when nothing was thrown', () => {
    const { warn, logger } = makePinoLogger();

    logger.warn('Circuit breaker opened');

    expect(warn).toHaveBeenCalledWith('Circuit breaker opened');
  });

  it('keeps structured fields alongside the serialized error', () => {
    const { error, logger } = makePinoLogger();

    logger.error('Scheduled job digest failed', new Error('boom'), {
      event: 'job.digest.failed',
      job: 'digest',
      durationMs: 12,
    });

    const [payload] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ event: 'job.digest.failed', job: 'digest', durationMs: 12 });
    expect(payload.err).toMatchObject({ name: 'Error', message: 'boom' });
  });

  it('carries fields on a warn with nothing thrown behind it', () => {
    const { warn, logger } = makePinoLogger();

    logger.warn('job.digest.misconfigured', undefined, {
      event: 'job.digest.misconfigured',
      job: 'digest',
      reason: 'no_trigger_configured',
    });

    expect(warn).toHaveBeenCalledWith(
      { event: 'job.digest.misconfigured', job: 'digest', reason: 'no_trigger_configured' },
      'job.digest.misconfigured',
    );
  });

  it('sends info lines through a child pinned to info, since production logs at warn', () => {
    const { child, info, logger } = makePinoLogger();

    logger.info('job.digest.completed', {
      event: 'job.digest.completed',
      job: 'digest',
      processed: 3,
    });

    expect(child).toHaveBeenCalledWith({}, { level: 'info' });
    expect(info).toHaveBeenCalledWith(
      { event: 'job.digest.completed', job: 'digest', processed: 3 },
      'job.digest.completed',
    );
  });

  it('builds that child once, however many lines go through it', () => {
    const { child, logger } = makePinoLogger();

    logger.info('job.digest.completed');
    logger.info('job.reminders.completed');

    expect(child).toHaveBeenCalledTimes(1);
  });
});
