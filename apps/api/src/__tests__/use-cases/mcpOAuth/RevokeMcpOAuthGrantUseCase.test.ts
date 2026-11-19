import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { RevokeMcpOAuthGrantUseCase } from '#src/use-cases/mcpOAuth/RevokeMcpOAuthGrantUseCase.js';

describe('RevokeMcpOAuthGrantUseCase', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');
  const grant = { familyId: 'grant-1', userId: 'user-1' };

  function makeUseCase() {
    const tokenRepository = {
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
    };
    const refreshTokenRepository = {
      findByTokenHash: vi.fn().mockResolvedValue(null),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
    };
    return {
      useCase: new RevokeMcpOAuthGrantUseCase({
        mcpOAuthTokenRepository: tokenRepository as never,
        mcpOAuthRefreshTokenRepository: refreshTokenRepository as never,
        now: () => now,
      }),
      tokenRepository,
      refreshTokenRepository,
    };
  }

  it('revokes the whole grant when handed an access token', async () => {
    const ctx = makeUseCase();
    ctx.tokenRepository.findByTokenHash.mockResolvedValue(grant);

    expect(await ctx.useCase.execute('trakwyn_mcp_abc')).toBe('user-1');

    // Both halves: leaving the refresh token alive would let the client mint a
    // new access token seconds later, which is not what revoking means.
    expect(ctx.tokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.refreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
  });

  it('revokes the whole grant when handed a refresh token', async () => {
    const ctx = makeUseCase();
    ctx.refreshTokenRepository.findByTokenHash.mockResolvedValue(grant);

    expect(await ctx.useCase.execute('trakwyn_mcp_refresh_abc')).toBe('user-1');

    expect(ctx.refreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.tokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    // A refresh token starts with the access-token prefix, so the longer prefix
    // has to be tested first or it is looked up in the wrong table and the
    // endpoint answers 200 having revoked nothing.
    expect(ctx.tokenRepository.findByTokenHash).not.toHaveBeenCalled();
  });

  it('looks the credential up by hash, never by its raw value', async () => {
    const ctx = makeUseCase();
    ctx.tokenRepository.findByTokenHash.mockResolvedValue(grant);

    await ctx.useCase.execute('trakwyn_mcp_abc');

    expect(ctx.tokenRepository.findByTokenHash).toHaveBeenCalledWith(
      createHash('sha256').update('trakwyn_mcp_abc').digest('hex'),
    );
  });

  it('reports nothing revoked for an unknown token, without disclosing that', async () => {
    const ctx = makeUseCase();

    expect(await ctx.useCase.execute('trakwyn_mcp_unknown')).toBeNull();
    expect(ctx.tokenRepository.revokeFamily).not.toHaveBeenCalled();
  });

  it('does not query storage for another credential type', async () => {
    const ctx = makeUseCase();

    expect(await ctx.useCase.execute('trakwyn_api_token')).toBeNull();
    expect(ctx.tokenRepository.findByTokenHash).not.toHaveBeenCalled();
    expect(ctx.refreshTokenRepository.findByTokenHash).not.toHaveBeenCalled();
  });
});
