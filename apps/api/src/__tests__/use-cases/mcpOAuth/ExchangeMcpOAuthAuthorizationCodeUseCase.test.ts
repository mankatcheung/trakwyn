import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ExchangeMcpOAuthAuthorizationCodeUseCase } from '#src/use-cases/mcpOAuth/ExchangeMcpOAuthAuthorizationCodeUseCase.js';

describe('ExchangeMcpOAuthAuthorizationCodeUseCase', () => {
  // RFC 7636 requires 43-128 unreserved characters; anything shorter is now
  // rejected before it reaches the comparison.
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const now = new Date('2026-08-19T12:00:00.000Z');
  const redirectUri = 'http://localhost:6274/callback';
  const client = {
    id: 'client-1',
    name: 'MCP Client',
    redirectUris: [redirectUri],
    revokedAt: null,
    createdAt: now,
  };
  const code = {
    id: 'code-1',
    codeHash: 'hash',
    familyId: 'grant-1',
    clientId: 'client-1',
    userId: 'user-1',
    redirectUri,
    scope: 'read' as const,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256' as const,
    expiresAt: new Date('2026-08-19T12:05:00.000Z'),
    consumedAt: null,
    createdAt: now,
  };
  const validInput = {
    code: `trakwyn_mcp_code_${'0'.repeat(64)}`,
    clientId: 'client-1',
    redirectUri,
    codeVerifier: verifier,
  };

  function makeUseCase(codeOverrides: Record<string, unknown> = {}) {
    const authorizationCodeRepository = {
      findByCodeHash: vi.fn().mockResolvedValue({ ...code, ...codeOverrides }),
      consume: vi.fn().mockResolvedValue(true),
    };
    const clientRepository = { findById: vi.fn().mockResolvedValue(client) };
    const tokenRepository = { revokeFamily: vi.fn().mockResolvedValue(undefined) };
    const refreshTokenRepository = { revokeFamily: vi.fn().mockResolvedValue(undefined) };
    const securityEventRepository = { create: vi.fn().mockResolvedValue(undefined) };
    const createMcpOAuthAccessTokenUseCase = {
      execute: vi.fn().mockResolvedValue({
        rawToken: 'trakwyn_mcp_access',
        token: { id: 'token-1', userId: 'user-1', scope: 'read', expiresAt: code.expiresAt },
      }),
    };
    const createMcpOAuthRefreshTokenUseCase = {
      execute: vi.fn().mockResolvedValue({ rawToken: 'trakwyn_mcp_refresh_token' }),
    };
    return {
      useCase: new ExchangeMcpOAuthAuthorizationCodeUseCase({
        mcpOAuthAuthorizationCodeRepository: authorizationCodeRepository as never,
        mcpOAuthClientRepository: clientRepository as never,
        mcpOAuthTokenRepository: tokenRepository as never,
        mcpOAuthRefreshTokenRepository: refreshTokenRepository as never,
        securityEventRepository: securityEventRepository as never,
        createMcpOAuthAccessTokenUseCase,
        createMcpOAuthRefreshTokenUseCase,
        generateId: () => 'event-1',
        now: () => now,
      }),
      authorizationCodeRepository,
      clientRepository,
      tokenRepository,
      refreshTokenRepository,
      securityEventRepository,
      createMcpOAuthAccessTokenUseCase,
      createMcpOAuthRefreshTokenUseCase,
    };
  }

  it('verifies PKCE and exchanges a valid authorization code once', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute(validInput);

    expect(result).toEqual({
      accessToken: 'trakwyn_mcp_access',
      refreshToken: 'trakwyn_mcp_refresh_token',
      token: expect.objectContaining({ id: 'token-1' }),
    });
    expect(ctx.authorizationCodeRepository.consume).toHaveBeenCalledWith('code-1', now);
    // Both tokens inherit the code's grant, so one revocation reaches both.
    expect(ctx.createMcpOAuthAccessTokenUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'grant-1' }),
    );
    expect(ctx.createMcpOAuthRefreshTokenUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'grant-1' }),
    );
  });

  it('refuses a code_verifier that does not match the stored challenge', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute({ ...validInput, codeVerifier: 'b'.repeat(43) });

    expect(result).toBeNull();
    expect(ctx.authorizationCodeRepository.consume).not.toHaveBeenCalled();
  });

  it('refuses a code_verifier outside the RFC 7636 length range', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute({ ...validInput, codeVerifier: 'short' });

    expect(result).toBeNull();
    // Rejected before any lookup — a malformed verifier is not a storage question.
    expect(ctx.clientRepository.findById).not.toHaveBeenCalled();
  });

  it('refuses an expired authorization code', async () => {
    const ctx = makeUseCase({ expiresAt: new Date('2026-08-19T11:59:59.000Z') });

    expect(await ctx.useCase.execute(validInput)).toBeNull();
    expect(ctx.authorizationCodeRepository.consume).not.toHaveBeenCalled();
  });

  it('refuses a redirect_uri that differs from the one the code was issued for', async () => {
    const ctx = makeUseCase();
    ctx.clientRepository.findById.mockResolvedValue({
      ...client,
      redirectUris: [redirectUri, 'https://elsewhere.example/callback'],
    });

    const result = await ctx.useCase.execute({
      ...validInput,
      redirectUri: 'https://elsewhere.example/callback',
    });

    // Registered by the client, but not what this code was bound to.
    expect(result).toBeNull();
    expect(ctx.authorizationCodeRepository.consume).not.toHaveBeenCalled();
  });

  it('refuses a code presented by a different client than it was issued to', async () => {
    const ctx = makeUseCase();
    ctx.clientRepository.findById.mockResolvedValue({ ...client, id: 'client-2' });

    expect(await ctx.useCase.execute({ ...validInput, clientId: 'client-2' })).toBeNull();
  });

  it('refuses a code whose client registration has been revoked', async () => {
    const ctx = makeUseCase();
    ctx.clientRepository.findById.mockResolvedValue({ ...client, revokedAt: now });

    expect(await ctx.useCase.execute(validInput)).toBeNull();
  });

  it('revokes the whole grant when an already-consumed code is replayed', async () => {
    const ctx = makeUseCase({ consumedAt: now });

    const result = await ctx.useCase.execute(validInput);

    // Refusing is not enough: the tokens the first exchange produced may be
    // the attacker's, so the grant goes with them (OAuth 2.1 s4.1.3).
    expect(result).toBeNull();
    expect(ctx.tokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.refreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.securityEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'mcp_oauth_code_reuse_detected' }),
    );
  });

  it('revokes the grant when it loses the race to consume the code', async () => {
    const ctx = makeUseCase();
    // Another exchange won between the read and the conditional update.
    ctx.authorizationCodeRepository.consume.mockResolvedValue(false);

    expect(await ctx.useCase.execute(validInput)).toBeNull();
    expect(ctx.tokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
    expect(ctx.refreshTokenRepository.revokeFamily).toHaveBeenCalledWith('grant-1', now);
  });

  it('does not query storage for a credential that is not an authorization code', async () => {
    const ctx = makeUseCase();

    expect(await ctx.useCase.execute({ ...validInput, code: 'trakwyn_mcp_access' })).toBeNull();
    expect(ctx.clientRepository.findById).not.toHaveBeenCalled();
  });
});
