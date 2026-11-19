import { describe, expect, it, vi } from 'vitest';
import { CreateMcpOAuthAccessTokenUseCase } from '#src/use-cases/mcpOAuth/CreateMcpOAuthAccessTokenUseCase.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';

describe('CreateMcpOAuthAccessTokenUseCase', () => {
  it('creates a hashed, scoped MCP access token with an expiry', async () => {
    const repository = {
      create: vi.fn().mockImplementation(async (data) => ({
        ...data,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      })),
    } as unknown as IMcpOAuthTokenRepository;
    const now = new Date('2026-08-19T12:00:00.000Z');
    const useCase = new CreateMcpOAuthAccessTokenUseCase({
      mcpOAuthTokenRepository: repository,
      generateId: () => 'token-1',
      now: () => now,
    });

    const result = await useCase.execute({
      userId: 'user-1',
      clientId: 'client-1',
      familyId: 'grant-1',
      scope: 'read',
    });

    expect(result.rawToken).toMatch(/^trakwyn_mcp_[a-f0-9]{64}$/);
    expect(result.token).toMatchObject({
      id: 'token-1',
      userId: 'user-1',
      clientId: 'client-1',
      scope: 'read',
      audience: '/mcp',
      expiresAt: new Date('2026-08-19T13:00:00.000Z'),
    });
    expect(result.token.tokenHash).not.toBe(result.rawToken);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'token-1',
        userId: 'user-1',
        clientId: 'client-1',
        scope: 'read',
        audience: '/mcp',
      }),
    );
  });
});
