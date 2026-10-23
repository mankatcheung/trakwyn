import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { ValidateApiTokenUseCase } from '#src/use-cases/apiTokens/ValidateApiTokenUseCase.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';
import {
  makeEntitlementService,
  makeFreeEntitlementService,
} from '#src/__tests__/helpers/mocks/plans.js';

describe('ValidateApiTokenUseCase', () => {
  it('returns null when token hash is not found', async () => {
    const repo = makeApiTokenRepository({ findByTokenHash: vi.fn().mockResolvedValue(null) });
    const useCase = new ValidateApiTokenUseCase({
      apiTokenRepository: repo,
      entitlementService: makeEntitlementService(),
    });

    const result = await useCase.execute('trakwyn_unknown');

    expect(result).toBeNull();
    expect(repo.updateLastUsed).not.toHaveBeenCalled();
  });

  it('returns user identity and updates lastUsedAt when token is valid', async () => {
    const rawToken = 'trakwyn_abc123';
    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    const token = makeApiToken({ id: 'token-1', userId: 'user-1' });
    const repo = makeApiTokenRepository({
      findByTokenHash: vi
        .fn()
        .mockImplementation(async (hash: string) =>
          hash === expectedHash ? { token, userEmail: 'user@example.com' } : null,
        ),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new ValidateApiTokenUseCase({
      apiTokenRepository: repo,
      entitlementService: makeEntitlementService(),
    });

    const result = await useCase.execute(rawToken);

    expect(result).toEqual({ sub: 'user-1', email: 'user@example.com', scope: 'full' });
    expect(repo.updateLastUsed).toHaveBeenCalledWith('token-1');
  });

  it('stops honouring a token whose owner is no longer on a plan with API access', async () => {
    const token = makeApiToken({ id: 'token-1', userId: 'user-1' });
    const repo = makeApiTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue({ token, userEmail: 'user@example.com' }),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    });
    const entitlementService = makeFreeEntitlementService();
    const useCase = new ValidateApiTokenUseCase({
      apiTokenRepository: repo,
      entitlementService,
    });

    const result = await useCase.execute('trakwyn_abc123');

    expect(result).toBeNull();
    expect(entitlementService.forUserId).toHaveBeenCalledWith('user-1');
    expect(repo.updateLastUsed).not.toHaveBeenCalled();
  });
});
