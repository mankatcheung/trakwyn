import { describe, it, expect, vi } from 'vitest';
import { LoggingSecurityEventRepository } from '#src/infrastructure/db/repositories/LoggingSecurityEventRepository.js';
import {
  SECURITY_EVENT_TYPES,
  SUSPICIOUS_SECURITY_EVENT_TYPES,
  type SecurityEventType,
} from '#src/domain/securityEvent/SecurityEvent.js';
import type { CreateSecurityEventData } from '#src/use-cases/ports/ISecurityEventRepository.js';
import {
  makeSecurityEvent,
  makeSecurityEventRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';

const IP = '203.0.113.42';
const USER_AGENT = 'Mozilla/5.0 (Macintosh) Secret/1.0';

function makeRepo(innerOverrides?: Parameters<typeof makeSecurityEventRepository>[0]) {
  const inner = makeSecurityEventRepository({
    create: vi
      .fn()
      .mockImplementation(async (data: CreateSecurityEventData) => makeSecurityEvent({ ...data })),
    ...innerOverrides,
  });
  const logger = makeLogger();
  const metrics = makeFakeMetrics();
  const repo = new LoggingSecurityEventRepository({ inner, logger, metrics });
  return { repo, inner, logger, metrics };
}

const data = (eventType: SecurityEventType): CreateSecurityEventData => ({
  id: 'sec-1',
  userId: 'user-1',
  eventType,
  ipAddress: IP,
  userAgent: USER_AGENT,
});

describe('LoggingSecurityEventRepository', () => {
  it('delegates create to the inner repository and returns its result', async () => {
    const { repo, inner } = makeRepo();

    const result = await repo.create(data('password_changed'));

    expect(inner.create).toHaveBeenCalledWith(data('password_changed'));
    expect(result).toMatchObject({ id: 'sec-1', eventType: 'password_changed' });
  });

  it('logs an ordinary event at info with only the user id and event type', async () => {
    const { repo, logger } = makeRepo();

    await repo.create(data('password_changed'));

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Security event', {
      event: 'security.password_changed',
      eventType: 'password_changed',
      userId: 'user-1',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([...SUSPICIOUS_SECURITY_EVENT_TYPES])('logs %s at warn', async (eventType) => {
    const { repo, logger } = makeRepo();

    await repo.create(data(eventType));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Suspicious security event', undefined, {
      event: `security.${eventType}`,
      eventType,
      userId: 'user-1',
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each(SECURITY_EVENT_TYPES)(
    'writes exactly one line and one counter increment for %s, with no IP or user agent',
    async (eventType) => {
      const { repo, logger, metrics } = makeRepo();

      await repo.create(data(eventType));

      const lines = [...vi.mocked(logger.info).mock.calls, ...vi.mocked(logger.warn).mock.calls];
      expect(lines).toHaveLength(1);
      expect(metrics.securityEvents).toEqual([eventType]);
      const logged = JSON.stringify(lines);
      expect(logged).not.toContain(IP);
      expect(logged).not.toContain(USER_AGENT);
    },
  );

  it('neither logs nor counts when the write fails', async () => {
    const { repo, logger, metrics } = makeRepo({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(repo.create(data('password_changed'))).rejects.toThrow('db down');

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.securityEvents).toEqual([]);
  });

  it('passes findRecentByUserId through without logging', async () => {
    const events = [makeSecurityEvent()];
    const { repo, inner, logger } = makeRepo({
      findRecentByUserId: vi.fn().mockResolvedValue(events),
    });

    await expect(repo.findRecentByUserId('user-1', 10)).resolves.toBe(events);

    expect(inner.findRecentByUserId).toHaveBeenCalledWith('user-1', 10);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
