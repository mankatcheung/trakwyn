import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevokeSessionUseCase } from '#src/use-cases/sessions/RevokeSessionUseCase.js';
import { makeSecurityEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeSession, makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';

function securityDeps() {
  return { securityEventRepository: makeSecurityEventRepository(), generateId: () => 'evt-1' };
}

describe('RevokeSessionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the session does not belong to the user', async () => {
    const sessionRepository = makeSessionRepository({
      findByIdAndUserId: vi.fn().mockResolvedValue(null),
    });

    const err = await new RevokeSessionUseCase({ sessionRepository, ...securityDeps() })
      .execute('session-1', 'user-1')
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(sessionRepository.revoke).not.toHaveBeenCalled();
  });

  it('revokes the session when owned by the user', async () => {
    const session = makeSession({ id: 'session-1', userId: 'user-1' });
    const sessionRepository = makeSessionRepository({
      findByIdAndUserId: vi.fn().mockResolvedValue(session),
    });

    await new RevokeSessionUseCase({ sessionRepository, ...securityDeps() }).execute(
      'session-1',
      'user-1',
    );

    expect(sessionRepository.findByIdAndUserId).toHaveBeenCalledWith('session-1', 'user-1');
    expect(sessionRepository.revoke).toHaveBeenCalledWith('session-1');
  });

  it('records a session_revoked security event with the caller device info', async () => {
    const session = makeSession({ id: 'session-1', userId: 'user-1' });
    const sessionRepository = makeSessionRepository({
      findByIdAndUserId: vi.fn().mockResolvedValue(session),
    });
    const securityEventRepository = makeSecurityEventRepository();

    await new RevokeSessionUseCase({
      sessionRepository,
      securityEventRepository,
      generateId: () => 'evt-1',
    }).execute('session-1', 'user-1', '1.2.3.4', 'Mozilla/5.0');

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'evt-1',
      userId: 'user-1',
      eventType: 'session_revoked',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });
});
