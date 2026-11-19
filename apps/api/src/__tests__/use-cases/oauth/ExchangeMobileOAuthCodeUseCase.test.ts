import { describe, it, expect, vi } from 'vitest';
import { ExchangeMobileOAuthCodeUseCase } from '#src/use-cases/oauth/ExchangeMobileOAuthCodeUseCase.js';
import type { IMobileOAuthHandoffService } from '#src/use-cases/ports/IMobileOAuthHandoffService.js';

const makeHandoffService = (
  overrides?: Partial<IMobileOAuthHandoffService>,
): IMobileOAuthHandoffService => ({
  verify: vi.fn().mockReturnValue({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
  ...overrides,
});

describe('ExchangeMobileOAuthCodeUseCase', () => {
  it('returns the tokens the handoff code carries', async () => {
    const mobileOAuthHandoffService = makeHandoffService();
    const useCase = new ExchangeMobileOAuthCodeUseCase({ mobileOAuthHandoffService });

    const result = await useCase.execute({ code: 'handoff-code', codeVerifier: 'verifier-1' });

    expect(mobileOAuthHandoffService.verify).toHaveBeenCalledWith('handoff-code', 'verifier-1');
    expect(result).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('throws UNAUTHORIZED for an invalid or expired code, hiding the infra-level reason', async () => {
    const mobileOAuthHandoffService = makeHandoffService({
      verify: vi.fn().mockImplementation(() => {
        throw new Error('OAuth handoff code expired');
      }),
    });
    const useCase = new ExchangeMobileOAuthCodeUseCase({ mobileOAuthHandoffService });

    const err = await useCase
      .execute({ code: 'stale-code', codeVerifier: 'verifier-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED for a codeVerifier that does not match the issued challenge', async () => {
    const mobileOAuthHandoffService = makeHandoffService({
      verify: vi.fn().mockImplementation(() => {
        throw new Error('Invalid OAuth handoff PKCE verifier');
      }),
    });
    const useCase = new ExchangeMobileOAuthCodeUseCase({ mobileOAuthHandoffService });

    const err = await useCase
      .execute({ code: 'handoff-code', codeVerifier: 'wrong-verifier' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });
});
