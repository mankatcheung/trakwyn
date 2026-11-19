import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevokeOtherSessionsUseCase } from '#src/use-cases/sessions/RevokeOtherSessionsUseCase.js';
import { makeSecurityEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';

describe('RevokeOtherSessionsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes all sessions for the user except the current one', async () => {
    const sessionRepository = makeSessionRepository();

    await new RevokeOtherSessionsUseCase({
      sessionRepository,
      securityEventRepository: makeSecurityEventRepository(),
      generateId: () => 'evt-1',
    }).execute('user-1', 'session-1');

    expect(sessionRepository.revokeAllForUserExcept).toHaveBeenCalledWith('user-1', 'session-1');
  });

  it('records an other_sessions_revoked security event with the caller device info', async () => {
    const sessionRepository = makeSessionRepository();
    const securityEventRepository = makeSecurityEventRepository();

    await new RevokeOtherSessionsUseCase({
      sessionRepository,
      securityEventRepository,
      generateId: () => 'evt-1',
    }).execute('user-1', 'session-1', '1.2.3.4', 'Mozilla/5.0');

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'evt-1',
      userId: 'user-1',
      eventType: 'other_sessions_revoked',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });
});
