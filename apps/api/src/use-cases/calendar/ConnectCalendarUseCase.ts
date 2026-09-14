import { CalendarProviderError } from '#src/use-cases/errors/DomainError.js';
import type { ICalendarConnectionRepository } from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import type { ICalendarProviderRegistry } from '#src/use-cases/ports/ICalendarProviderRegistry.js';
import type {
  ConnectCalendarInput,
  IConnectCalendarUseCase,
} from '#src/use-cases/calendar/IConnectCalendarUseCase.js';

interface Deps {
  calendarConnectionRepository: ICalendarConnectionRepository;
  calendarProviderRegistry: ICalendarProviderRegistry;
  generateId: () => string;
}

export class ConnectCalendarUseCase implements IConnectCalendarUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConnectCalendarInput): Promise<void> {
    const provider = this.deps.calendarProviderRegistry.get(input.provider);

    let tokens;
    try {
      tokens = await provider.exchangeCodeForTokens(
        input.code,
        input.redirectUri,
        input.codeVerifier,
      );
    } catch {
      throw new CalendarProviderError('Could not connect this calendar — please try again');
    }

    // `create` upserts on (userId, provider) — reconnecting replaces the
    // stored tokens rather than erroring, so re-granting consent after a
    // revoke or an expired refresh token is just "connect" again.
    await this.deps.calendarConnectionRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      provider: input.provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      externalCalendarId: tokens.externalCalendarId,
    });
  }
}
