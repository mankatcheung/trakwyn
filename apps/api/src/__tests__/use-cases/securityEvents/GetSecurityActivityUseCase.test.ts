import { describe, it, expect, vi } from 'vitest';
import { GetSecurityActivityUseCase } from '#src/use-cases/securityEvents/GetSecurityActivityUseCase.js';
import {
  makeLoginEvent,
  makeLoginEventRepository,
  makeSecurityEvent,
  makeSecurityEventRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { SECURITY_ACTIVITY } from '#src/use-cases/constants.js';

describe('GetSecurityActivityUseCase', () => {
  it('merges logins and security events into one feed', async () => {
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi
        .fn()
        .mockResolvedValue([
          makeLoginEvent({ id: 'login-1', createdAt: new Date('2024-01-02T00:00:00.000Z') }),
        ]),
    });
    const securityEventRepository = makeSecurityEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue([
        makeSecurityEvent({
          id: 'sec-1',
          eventType: 'password_changed',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      ]),
    });

    const result = await new GetSecurityActivityUseCase({
      loginEventRepository,
      securityEventRepository,
    }).execute('user-1');

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.eventType)).toEqual(['login', 'password_changed']);
    expect(loginEventRepository.findRecentByUserId).toHaveBeenCalledWith(
      'user-1',
      SECURITY_ACTIVITY.LIMIT,
    );
    expect(securityEventRepository.findRecentByUserId).toHaveBeenCalledWith(
      'user-1',
      SECURITY_ACTIVITY.LIMIT,
    );
  });

  it('sorts the merged feed newest first regardless of source', async () => {
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi
        .fn()
        .mockResolvedValue([
          makeLoginEvent({ id: 'login-old', createdAt: new Date('2024-01-01T00:00:00.000Z') }),
          makeLoginEvent({ id: 'login-new', createdAt: new Date('2024-01-05T00:00:00.000Z') }),
        ]),
    });
    const securityEventRepository = makeSecurityEventRepository({
      findRecentByUserId: vi
        .fn()
        .mockResolvedValue([
          makeSecurityEvent({ id: 'sec-mid', createdAt: new Date('2024-01-03T00:00:00.000Z') }),
        ]),
    });

    const result = await new GetSecurityActivityUseCase({
      loginEventRepository,
      securityEventRepository,
    }).execute('user-1');

    expect(result.map((r) => r.id)).toEqual(['login-new', 'sec-mid', 'login-old']);
  });

  it('truncates the merged feed to the overall limit', async () => {
    const manyLogins = Array.from({ length: SECURITY_ACTIVITY.LIMIT }, (_, i) =>
      makeLoginEvent({
        id: `login-${i}`,
        createdAt: new Date(2024, 0, i + 1),
      }),
    );
    const manySecurityEvents = Array.from({ length: SECURITY_ACTIVITY.LIMIT }, (_, i) =>
      makeSecurityEvent({
        id: `sec-${i}`,
        createdAt: new Date(2024, 1, i + 1),
      }),
    );
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue(manyLogins),
    });
    const securityEventRepository = makeSecurityEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue(manySecurityEvents),
    });

    const result = await new GetSecurityActivityUseCase({
      loginEventRepository,
      securityEventRepository,
    }).execute('user-1');

    expect(result).toHaveLength(SECURITY_ACTIVITY.LIMIT);
    // The more-recent February security events should all win over January logins.
    expect(result.every((r) => r.eventType !== 'login')).toBe(true);
  });

  it('returns an empty array when there is no activity', async () => {
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue([]),
    });
    const securityEventRepository = makeSecurityEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetSecurityActivityUseCase({
      loginEventRepository,
      securityEventRepository,
    }).execute('user-1');

    expect(result).toEqual([]);
  });
});
