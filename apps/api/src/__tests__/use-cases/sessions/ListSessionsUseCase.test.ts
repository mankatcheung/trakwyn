import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListSessionsUseCase } from '#src/use-cases/sessions/ListSessionsUseCase.js';
import { makeSession, makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';

describe('ListSessionsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active sessions for the given user', async () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
    const sessionRepository = makeSessionRepository({
      findActiveByUserId: vi.fn().mockResolvedValue(sessions),
    });

    const result = await new ListSessionsUseCase({ sessionRepository }).execute('user-1');

    expect(sessionRepository.findActiveByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(sessions);
  });
});
