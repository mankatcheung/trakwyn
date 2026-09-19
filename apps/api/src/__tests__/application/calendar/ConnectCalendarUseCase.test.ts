import { describe, it, expect, vi } from 'vitest';
import { ConnectCalendarUseCase } from '#src/use-cases/calendar/ConnectCalendarUseCase.js';
import {
  makeCalendarConnectionRepository,
  makeCalendarProvider,
  makeCalendarProviderRegistry,
} from '#src/__tests__/helpers/mocks/calendar.js';

const input = {
  userId: 'user-1',
  provider: 'google' as const,
  code: 'auth-code',
  redirectUri: 'https://api/cb',
  codeVerifier: 'test-verifier',
};

describe('ConnectCalendarUseCase', () => {
  it('stores the connection with tokens returned by the provider', async () => {
    const calendarConnectionRepository = makeCalendarConnectionRepository();
    const useCase = new ConnectCalendarUseCase({
      calendarConnectionRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry(),
      generateId: vi.fn().mockReturnValue('connection-1'),
    });

    await useCase.execute(input);

    expect(calendarConnectionRepository.create).toHaveBeenCalledWith({
      id: 'connection-1',
      userId: 'user-1',
      provider: 'google',
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      accessTokenExpiresAt: new Date('2099-01-01'),
      externalCalendarId: 'primary',
    });
  });

  it('wraps a provider failure in CALENDAR_PROVIDER_ERROR', async () => {
    const calendarConnectionRepository = makeCalendarConnectionRepository();
    const provider = makeCalendarProvider({
      exchangeCodeForTokens: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const useCase = new ConnectCalendarUseCase({
      calendarConnectionRepository,
      calendarProviderRegistry: makeCalendarProviderRegistry({
        get: vi.fn().mockReturnValue(provider),
      }),
      generateId: vi.fn(),
    });

    const err = await useCase.execute(input).catch((e) => e);

    expect((err as { code: string }).code).toBe('CALENDAR_PROVIDER_ERROR');
    expect(calendarConnectionRepository.create).not.toHaveBeenCalled();
  });
});
