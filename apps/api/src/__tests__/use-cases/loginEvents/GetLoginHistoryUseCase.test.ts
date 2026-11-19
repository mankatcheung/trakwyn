import { describe, it, expect, vi } from 'vitest';
import { GetLoginHistoryUseCase } from '#src/use-cases/loginEvents/GetLoginHistoryUseCase.js';
import { makeLoginEvent, makeLoginEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { LOGIN_HISTORY } from '#src/use-cases/constants.js';

describe('GetLoginHistoryUseCase', () => {
  it('returns the recent login events for the user', async () => {
    const events = [makeLoginEvent({ id: 'event-1' }), makeLoginEvent({ id: 'event-2' })];
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue(events),
    });

    const useCase = new GetLoginHistoryUseCase({ loginEventRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual(events);
    expect(loginEventRepository.findRecentByUserId).toHaveBeenCalledWith(
      'user-1',
      LOGIN_HISTORY.LIMIT,
    );
  });

  it('returns an empty array when the user has no login events', async () => {
    const loginEventRepository = makeLoginEventRepository({
      findRecentByUserId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new GetLoginHistoryUseCase({ loginEventRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual([]);
  });
});
