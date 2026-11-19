import { describe, expect, it, vi } from 'vitest';
import { RevokeMcpOAuthGrantForUserUseCase } from '#src/use-cases/mcpOAuth/RevokeMcpOAuthGrantForUserUseCase.js';

describe('RevokeMcpOAuthGrantForUserUseCase', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const ownGrant = {
    id: 'grant-1',
    userId: 'user-1',
    clientId: 'client-1',
    clientName: 'Claude Desktop',
    scope: 'full' as const,
    authorizedAt: new Date('2026-08-19T09:00:00.000Z'),
    lastUsedAt: null,
  };

  function makeUseCase(grants = [ownGrant]) {
    const grantRepository = { findActiveByUserId: vi.fn().mockResolvedValue(grants) };
    const tokenRepository = { revokeFamily: vi.fn().mockResolvedValue(undefined) };
    const refreshTokenRepository = { revokeFamily: vi.fn().mockResolvedValue(undefined) };
    const securityEventRepository = { create: vi.fn().mockResolvedValue(undefined) };
    return {
      useCase: new RevokeMcpOAuthGrantForUserUseCase({
        mcpOAuthGrantRepository: grantRepository as never,
        mcpOAuthTokenRepository: tokenRepository as never,
        mcpOAuthRefreshTokenRepository: refreshTokenRepository as never,
        securityEventRepository: securityEventRepository as never,
        generateId: () => 'event-1',
        now: () => now,
      }),
      grantRepository,
      tokenRepository,
      refreshTokenRepository,
      securityEventRepository,
    };
  }

  it('revokes both token families for a grant the user owns', async () => {
    const ctx = makeUseCase();

    await expect(ctx.useCase.execute('user-1', 'grant-1')).resolves.toBe(true);

    // Both halves, or the client refreshes its way back in.
    expect(ctx.tokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.refreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
  });

  it('refuses to revoke a grant belonging to someone else', async () => {
    const ctx = makeUseCase();

    // A grant id is a plain identifier — receiving one proves nothing about
    // who owns it, and the caller holds a session rather than a token, so
    // ownership has to be established here or this is an IDOR.
    await expect(ctx.useCase.execute('user-1', 'someone-elses-grant')).resolves.toBe(false);

    expect(ctx.tokenRepository.revokeFamily).not.toHaveBeenCalled();
    expect(ctx.refreshTokenRepository.revokeFamily).not.toHaveBeenCalled();
    expect(ctx.securityEventRepository.create).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup to the calling user', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute('user-1', 'grant-1');

    expect(ctx.grantRepository.findActiveByUserId).toHaveBeenCalledWith('user-1', now);
  });

  it('reports nothing revoked when the user has no grants at all', async () => {
    const ctx = makeUseCase([]);

    await expect(ctx.useCase.execute('user-1', 'grant-1')).resolves.toBe(false);
    expect(ctx.tokenRepository.revokeFamily).not.toHaveBeenCalled();
  });

  it('records the same security event the client-initiated path records', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute('user-1', 'grant-1');

    // The audit trail is about the grant ending, not about who ended it.
    expect(ctx.securityEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'mcp_oauth_token_revoked' }),
    );
  });
});
