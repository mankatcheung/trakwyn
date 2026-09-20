import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { PinoLogger } from '#src/infrastructure/observability/PinoLogger.js';

function makePinoLogger() {
  const error = vi.fn();
  return { error, logger: new PinoLogger({ error } as unknown as FastifyBaseLogger) };
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
});
