import { describe, it, expect, vi } from 'vitest';
import { AuthenticateRequestUseCase } from '#src/use-cases/auth/AuthenticateRequestUseCase.js';
import type { ITokenService } from '#src/use-cases/ports/ITokenService.js';
import type { ValidateApiTokenUseCase } from '#src/use-cases/apiTokens/ValidateApiTokenUseCase.js';
import type { ISessionBlocklist } from '#src/use-cases/ports/ISessionBlocklist.js';

function makeTokenService(overrides?: Partial<ITokenService>): ITokenService {
  return {
    sign: vi.fn(),
    verifyRefresh: vi.fn(),
    verifyAccess: vi.fn(),
    ...overrides,
  };
}

function makeSessionBlocklist(overrides?: Partial<ISessionBlocklist>): ISessionBlocklist {
  return {
    revoke: vi.fn(),
    isRevoked: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeValidateApiTokenUseCase(
  execute?: ValidateApiTokenUseCase['execute'],
): ValidateApiTokenUseCase {
  return {
    execute: execute ?? vi.fn().mockResolvedValue(null),
  } as unknown as ValidateApiTokenUseCase;
}

describe('AuthenticateRequestUseCase', () => {
  it('returns user for a valid JWT', async () => {
    const tokenService = makeTokenService({
      verifyAccess: vi
        .fn()
        .mockReturnValue({ sub: 'user-1', email: 'user@example.com', sid: 'session-1' }),
    });
    const validateApiTokenUseCase = makeValidateApiTokenUseCase();
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('valid.jwt.token');

    expect(result).toEqual({ sub: 'user-1', email: 'user@example.com', sid: 'session-1' });
    expect(tokenService.verifyAccess).toHaveBeenCalledWith('valid.jwt.token');
    expect(validateApiTokenUseCase.execute).not.toHaveBeenCalled();
  });

  it('returns null for an expired/invalid JWT', async () => {
    const tokenService = makeTokenService({
      verifyAccess: vi.fn().mockImplementation(() => {
        throw new Error('jwt expired');
      }),
    });
    const validateApiTokenUseCase = makeValidateApiTokenUseCase();
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('expired.jwt.token');

    expect(result).toBeNull();
  });

  it('returns user (without sid) for a valid FULL-scope API token', async () => {
    const tokenService = makeTokenService();
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockResolvedValue({ sub: 'user-1', email: 'user@example.com', scope: 'full' }),
    );
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('trakwyn_abc123');

    expect(result).toEqual({ sub: 'user-1', email: 'user@example.com' });
    expect(validateApiTokenUseCase.execute).toHaveBeenCalledWith('trakwyn_abc123', 'graphql');
    expect(tokenService.verifyAccess).not.toHaveBeenCalled();
  });

  it('returns null for a valid READ-scope API token (GraphQL requires FULL)', async () => {
    const tokenService = makeTokenService();
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockResolvedValue({ sub: 'user-1', email: 'user@example.com', scope: 'read' }),
    );
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('trakwyn_readonly');

    expect(result).toBeNull();
  });

  it('returns null when the API token is not found', async () => {
    const tokenService = makeTokenService();
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(vi.fn().mockResolvedValue(null));
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('trakwyn_unknown');

    expect(result).toBeNull();
  });

  it('returns null when API token validation throws', async () => {
    const tokenService = makeTokenService();
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockRejectedValue(new Error('db error')),
    );
    const useCase = new AuthenticateRequestUseCase({
      tokenService,
      validateApiTokenUseCase,
      sessionBlocklist: makeSessionBlocklist(),
    });

    const result = await useCase.execute('trakwyn_broken');

    expect(result).toBeNull();
  });

  describe('revoked-session blocklist (JEF-164)', () => {
    const validClaims = { sub: 'user-1', email: 'user@example.com', sid: 'session-1' };

    it('rejects a still-unexpired, correctly-signed JWT whose session has been revoked', async () => {
      const tokenService = makeTokenService({
        verifyAccess: vi.fn().mockReturnValue(validClaims),
      });
      const sessionBlocklist = makeSessionBlocklist({
        isRevoked: vi.fn().mockResolvedValue(true),
      });
      const useCase = new AuthenticateRequestUseCase({
        tokenService,
        validateApiTokenUseCase: makeValidateApiTokenUseCase(),
        sessionBlocklist,
      });

      const result = await useCase.execute('valid.but.revoked');

      expect(result).toBeNull();
      expect(sessionBlocklist.isRevoked).toHaveBeenCalledWith('session-1');
    });

    it('still authenticates when the blocklist check reports not-revoked', async () => {
      const sessionBlocklist = makeSessionBlocklist({
        isRevoked: vi.fn().mockResolvedValue(false),
      });
      const useCase = new AuthenticateRequestUseCase({
        tokenService: makeTokenService({ verifyAccess: vi.fn().mockReturnValue(validClaims) }),
        validateApiTokenUseCase: makeValidateApiTokenUseCase(),
        sessionBlocklist,
      });

      const result = await useCase.execute('valid.jwt.token');

      expect(result).toEqual(validClaims);
    });

    it('skips the blocklist entirely for API tokens, which have no session', async () => {
      const sessionBlocklist = makeSessionBlocklist();
      const useCase = new AuthenticateRequestUseCase({
        tokenService: makeTokenService(),
        validateApiTokenUseCase: makeValidateApiTokenUseCase(
          vi.fn().mockResolvedValue({ sub: 'user-1', email: 'user@example.com', scope: 'full' }),
        ),
        sessionBlocklist,
      });

      const result = await useCase.execute('trakwyn_abc123');

      expect(result).toEqual({ sub: 'user-1', email: 'user@example.com' });
      expect(sessionBlocklist.isRevoked).not.toHaveBeenCalled();
    });

    it('authenticates a sid-less JWT without consulting the blocklist', async () => {
      const sessionBlocklist = makeSessionBlocklist();
      const useCase = new AuthenticateRequestUseCase({
        tokenService: makeTokenService({
          verifyAccess: vi.fn().mockReturnValue({ sub: 'user-1', email: 'user@example.com' }),
        }),
        validateApiTokenUseCase: makeValidateApiTokenUseCase(),
        sessionBlocklist,
      });

      const result = await useCase.execute('legacy.jwt.token');

      expect(result).toEqual({ sub: 'user-1', email: 'user@example.com' });
      expect(sessionBlocklist.isRevoked).not.toHaveBeenCalled();
    });
  });
});
