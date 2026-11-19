import { describe, it, expect, vi } from 'vitest';
import { CreateApiTokenUseCase } from '#src/use-cases/apiTokens/CreateApiTokenUseCase.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';

describe('CreateApiTokenUseCase', () => {
  it('generates a token with trakwyn_ prefix and stores its hash', async () => {
    const storedToken = makeApiToken();
    const repo = makeApiTokenRepository({ create: vi.fn().mockResolvedValue(storedToken) });
    const generateId = vi.fn().mockReturnValue('token-1');
    const useCase = new CreateApiTokenUseCase({
      apiTokenRepository: repo,
      generateId,
    });

    const { rawToken, token } = await useCase.execute({ userId: 'user-1', name: 'CLI' });

    expect(rawToken).toMatch(/^trakwyn_/);
    expect(token.id).toBe('token-1');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', name: 'CLI', tokenHash: expect.any(String) }),
    );
    // Hash must NOT equal raw token
    const call = vi.mocked(repo.create).mock.calls[0][0];
    expect(call.tokenHash).not.toBe(rawToken);
  });

  it('each call produces a unique raw token', async () => {
    const repo = makeApiTokenRepository({ create: vi.fn().mockResolvedValue(makeApiToken()) });
    const useCase = new CreateApiTokenUseCase({
      apiTokenRepository: repo,
      generateId: vi.fn(),
    });

    const [a, b] = await Promise.all([
      useCase.execute({ userId: 'user-1', name: 'A' }),
      useCase.execute({ userId: 'user-1', name: 'B' }),
    ]);

    expect(a.rawToken).not.toBe(b.rawToken);
  });
});
