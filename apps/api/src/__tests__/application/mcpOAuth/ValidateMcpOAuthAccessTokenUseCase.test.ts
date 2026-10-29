import { describe, expect, it, vi } from 'vitest';
import { ValidateMcpOAuthAccessTokenUseCase } from '#src/use-cases/mcpOAuth/ValidateMcpOAuthAccessTokenUseCase.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';

function makeRepository(token: Record<string, unknown> | null): IMcpOAuthTokenRepository {
  return {
    findByTokenHash: vi.fn().mockResolvedValue(token),
    updateLastUsed: vi.fn().mockResolvedValue(undefined),
  } as unknown as IMcpOAuthTokenRepository;
}

describe('ValidateMcpOAuthAccessTokenUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const validToken = {
    id: 'token-1',
    userId: 'user-1',
    clientId: 'client-1',
    familyId: 'grant-1',
    tokenHash: 'hash',
    scope: 'read',
    audience: '/mcp',
    expiresAt: new Date('2026-08-19T13:00:00.000Z'),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: now,
  };

  it('returns the subject and scope for a valid OAuth access token', async () => {
    const repository = makeRepository(validToken);
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    await expect(useCase.execute('trakwyn_mcp_valid')).resolves.toEqual({
      tokenId: 'token-1',
      sub: 'user-1',
      scope: 'read',
    });
    expect(repository.updateLastUsed).toHaveBeenCalledWith('token-1');
  });

  it.each([
    ['missing token', null],
    ['wrong audience', { ...validToken, audience: '/graphql' }],
    ['expired token', { ...validToken, expiresAt: new Date('2026-08-19T11:59:59.000Z') }],
    ['revoked token', { ...validToken, revokedAt: now }],
  ])('rejects a %s', async (_reason, token) => {
    const repository = makeRepository(token);
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    await expect(useCase.execute('trakwyn_mcp_invalid')).resolves.toBeNull();
    expect(repository.updateLastUsed).not.toHaveBeenCalled();
  });

  it('rejects credentials that are not MCP OAuth access tokens without querying storage', async () => {
    const repository = makeRepository(validToken);
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    await expect(useCase.execute('trakwyn_regular_api_token')).resolves.toBeNull();
    expect(repository.findByTokenHash).not.toHaveBeenCalled();
  });

  it('refuses an expired access token', async () => {
    const repository = makeRepository({
      ...validToken,
      expiresAt: new Date('2026-08-19T11:59:59.000Z'),
    });
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    expect(await useCase.execute('trakwyn_mcp_abc')).toBeNull();
    expect(repository.updateLastUsed).not.toHaveBeenCalled();
  });

  it('refuses a revoked access token', async () => {
    const repository = makeRepository({ ...validToken, revokedAt: now });
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    // This is what makes revocation immediate rather than "within the hour".
    expect(await useCase.execute('trakwyn_mcp_abc')).toBeNull();
  });

  it('refuses a token minted for a different audience', async () => {
    const repository = makeRepository({ ...validToken, audience: '/graphql' });
    const useCase = new ValidateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      now: () => now,
    });

    expect(await useCase.execute('trakwyn_mcp_abc')).toBeNull();
  });
});
