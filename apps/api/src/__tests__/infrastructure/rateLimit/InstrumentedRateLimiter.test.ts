import { describe, it, expect, vi } from 'vitest';
import {
  InstrumentedRateLimiter,
  describeRateLimitKey,
} from '#src/infrastructure/rateLimit/InstrumentedRateLimiter.js';
import { SECURITY_EVENTS } from '#src/infrastructure/config/constants.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

const inner = (allowed: boolean): IRateLimiter => ({ consume: vi.fn(async () => allowed) });

const build = (allowed: boolean, name = 'totpRateLimiter') => {
  const logger = makeLogger();
  const metrics = makeFakeMetrics();
  const limiter = new InstrumentedRateLimiter({ inner: inner(allowed), name, logger, metrics });
  return { limiter, logger, metrics };
};

/** Every field the decorator logs, so a leak shows up as a failing assertion. */
const loggedFields = (logger: ReturnType<typeof makeLogger>) =>
  vi.mocked(logger.warn).mock.calls[0]?.[1];

describe('describeRateLimitKey', () => {
  it.each([
    ['totp:ip:203.0.113.4', 'totp', 'ip'],
    ['totp:email:someone@example.com', 'totp', 'email'],
    ['totp:stepup:user:V1StGXR8', 'totp', 'user'],
    ['resume:user:V1StGXR8', 'resume', 'user'],
    ['chat:user:V1StGXR8', 'chat', 'user'],
    ['test-llm-api-key:user:V1StGXR8', 'test-llm-api-key', 'user'],
    ['mcp-oauth:ip:203.0.113.4:some-client', 'mcp-oauth', 'ip'],
  ])('reads %s as route %s, subject %s', (key, route, subject) => {
    expect(describeRateLimitKey(key)).toEqual({ route, subject });
  });

  it('reports an unrecognised subject as unknown rather than guessing', () => {
    expect(describeRateLimitKey('chat:V1StGXR8')).toEqual({ route: 'chat', subject: 'unknown' });
  });

  /**
   * The guard that matters: a key whose first segment is not the hard-coded
   * literal it is supposed to be must not put that segment in a log line or
   * a metric attribute (JEF-348).
   */
  it.each([
    'Mozilla/5.0 (Macintosh):ip:203.0.113.4',
    '203.0.113.4:user:V1StGXR8',
    'someone@example.com',
  ])('refuses to treat %s as a route', (key) => {
    expect(describeRateLimitKey(key).route).toBe('unknown');
  });
});

describe('InstrumentedRateLimiter', () => {
  it('passes an allowed request through and records nothing', async () => {
    const { limiter, logger, metrics } = build(true);

    await expect(limiter.consume('totp:ip:203.0.113.4')).resolves.toBe(true);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.rateLimited).toEqual([]);
  });

  it('logs and counts a rejection, and still rejects', async () => {
    const { limiter, logger, metrics } = build(false);

    await expect(limiter.consume('totp:ip:203.0.113.4')).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(loggedFields(logger)).toEqual({
      event: SECURITY_EVENTS.RATE_LIMITED,
      limiter: 'totpRateLimiter',
      route: 'totp',
      subject: 'ip',
    });
    expect(metrics.rateLimited).toEqual([{ route: 'totp', subject: 'ip' }]);
  });

  /**
   * The whole point of logging the *category*: an operator needs to know an
   * IP was limited on `totp` without the address itself landing in Axiom.
   */
  it.each([
    ['totp:ip:203.0.113.4', '203.0.113.4'],
    ['password-reset:email:someone@example.com', 'someone@example.com'],
    ['resume:user:V1StGXR8_secret', 'V1StGXR8_secret'],
  ])('keeps the subject value out of the log line for %s', async (key, value) => {
    const { limiter, logger } = build(false);

    await limiter.consume(key);

    expect(JSON.stringify(loggedFields(logger))).not.toContain(value);
  });

  it('names the limiter it decorates, so two routes sharing one are distinguishable', async () => {
    const { limiter, logger, metrics } = build(false, 'mcpOAuthAuthorizationRateLimiter');

    await limiter.consume('mcp-oauth:ip:203.0.113.4:some-client-id');

    expect(loggedFields(logger)).toMatchObject({
      limiter: 'mcpOAuthAuthorizationRateLimiter',
      route: 'mcp-oauth',
      subject: 'ip',
    });
    expect(metrics.rateLimited).toEqual([{ route: 'mcp-oauth', subject: 'ip' }]);
  });

  it('never lets the client id in an mcp-oauth key reach the log', async () => {
    const { limiter, logger } = build(false, 'mcpOAuthAuthorizationRateLimiter');

    await limiter.consume('mcp-oauth:ip:203.0.113.4:https://evil.example.com/cb');

    expect(JSON.stringify(loggedFields(logger))).not.toContain('evil.example.com');
  });
});
