import { describe, it, expect, vi } from 'vitest';
import { AuthenticateMcpRequestUseCase } from '#src/use-cases/auth/AuthenticateMcpRequestUseCase.js';
import type { ValidateApiTokenUseCase } from '#src/use-cases/apiTokens/ValidateApiTokenUseCase.js';
import type { ValidateMcpOAuthAccessTokenUseCase } from '#src/use-cases/mcpOAuth/ValidateMcpOAuthAccessTokenUseCase.js';
import { PLAN_FEATURES } from '#src/use-cases/constants.js';
import {
  makeEntitlementService,
  makeFreeEntitlements,
  makeFreeEntitlementService,
} from '#src/__tests__/helpers/mocks/plans.js';

function makeValidateApiTokenUseCase(
  execute?: ValidateApiTokenUseCase['execute'],
): ValidateApiTokenUseCase {
  return {
    execute: execute ?? vi.fn().mockResolvedValue(null),
  } as unknown as ValidateApiTokenUseCase;
}

function makeValidateMcpOAuthAccessTokenUseCase(
  execute?: ValidateMcpOAuthAccessTokenUseCase['execute'],
): ValidateMcpOAuthAccessTokenUseCase {
  return {
    execute: execute ?? vi.fn().mockResolvedValue(null),
  } as unknown as ValidateMcpOAuthAccessTokenUseCase;
}

describe('AuthenticateMcpRequestUseCase', () => {
  it('returns user id and scope for a valid FULL-scope API token', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user@example.com',
        scope: 'full',
        tokenId: 'token-1',
        tokenName: 'Claude',
      }),
    );
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
    });

    const result = await useCase.execute('trakwyn_abc123');

    // The scope is carried through, not discarded: McpController needs it to
    // refuse write tools for read-only tokens (JEF-176).
    expect(result).toEqual({
      sub: 'user-1',
      scope: 'full',
      actor: { source: 'mcp', apiTokenId: 'token-1', apiTokenName: 'Claude' },
    });
    expect(validateApiTokenUseCase.execute).toHaveBeenCalledWith('trakwyn_abc123', 'mcp');
  });

  it('returns user id and scope for a READ-scope API token (MCP accepts any scope)', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user@example.com',
        scope: 'read',
        tokenId: 'token-1',
        tokenName: 'Claude',
      }),
    );
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
    });

    const result = await useCase.execute('trakwyn_readonly');

    expect(result).toEqual({
      sub: 'user-1',
      scope: 'read',
      actor: { source: 'mcp', apiTokenId: 'token-1', apiTokenName: 'Claude' },
    });
  });

  it('returns null for a JWT (MCP only accepts API tokens)', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase();
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
    });

    const result = await useCase.execute('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

    expect(result).toBeNull();
    expect(validateApiTokenUseCase.execute).not.toHaveBeenCalled();
  });

  it('returns null when the API token is not found', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(vi.fn().mockResolvedValue(null));
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
    });

    const result = await useCase.execute('trakwyn_unknown');

    expect(result).toBeNull();
  });

  it('returns null when validation throws', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase(
      vi.fn().mockRejectedValue(new Error('db error')),
    );
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
    });

    const result = await useCase.execute('trakwyn_broken');

    expect(result).toBeNull();
  });

  it.each(['read', 'full'] as const)(
    'carries a %s OAuth grant through to the caller that gates write tools',
    async (scope) => {
      const validateApiTokenUseCase = makeValidateApiTokenUseCase();
      const validateMcpOAuthAccessTokenUseCase = makeValidateMcpOAuthAccessTokenUseCase(
        vi.fn().mockResolvedValue({
          sub: 'user-1',
          scope,
          grantId: 'grant-1',
          clientName: 'Claude Desktop',
        }),
      );
      const useCase = new AuthenticateMcpRequestUseCase({
        entitlementService: makeEntitlementService(),
        validateApiTokenUseCase,
        validateMcpOAuthAccessTokenUseCase,
      });

      // Dropping the scope here is what would silently turn a `read` consent
      // into full write access, since the tool gate has nothing else to go on.
      await expect(useCase.execute('trakwyn_mcp_access')).resolves.toEqual({
        sub: 'user-1',
        scope,
        actor: { source: 'mcp', apiTokenId: 'grant-1', apiTokenName: 'Claude Desktop' },
      });
      expect(validateApiTokenUseCase.execute).not.toHaveBeenCalled();
      expect(validateMcpOAuthAccessTokenUseCase.execute).toHaveBeenCalledWith('trakwyn_mcp_access');
    },
  );

  it('sends an OAuth token to the OAuth validator, never to the API-token one', async () => {
    const validateApiTokenUseCase = makeValidateApiTokenUseCase();
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase,
      validateMcpOAuthAccessTokenUseCase: makeValidateMcpOAuthAccessTokenUseCase(
        vi.fn().mockResolvedValue(null),
      ),
    });

    // `trakwyn_mcp_` extends `trakwyn_`, so checking the API-token prefix first
    // would route every OAuth token to the wrong validator.
    await expect(useCase.execute('trakwyn_mcp_access')).resolves.toBeNull();
    expect(validateApiTokenUseCase.execute).not.toHaveBeenCalled();
  });

  it('accepts an OAuth grant whose owner is on the Free plan, which includes MCP (JEF-442)', async () => {
    const entitlementService = makeFreeEntitlementService();
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService,
      validateApiTokenUseCase: makeValidateApiTokenUseCase(),
      validateMcpOAuthAccessTokenUseCase: makeValidateMcpOAuthAccessTokenUseCase(
        vi.fn().mockResolvedValue({
          sub: 'user-1',
          scope: 'full',
          grantId: 'grant-1',
          clientName: 'Claude Desktop',
        }),
      ),
    });

    await expect(useCase.execute('trakwyn_mcp_access')).resolves.toEqual({
      sub: 'user-1',
      scope: 'full',
      actor: { source: 'mcp', apiTokenId: 'grant-1', apiTokenName: 'Claude Desktop' },
    });
    expect(entitlementService.forUserId).toHaveBeenCalledWith('user-1');
  });

  it('rejects an OAuth grant whose owner is on a plan without MCP access', async () => {
    const entitlementService = makeEntitlementService({
      forUserId: vi.fn().mockResolvedValue(
        makeFreeEntitlements({
          features: { ...PLAN_FEATURES.free, mcpAccess: false },
        }),
      ),
    });
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService,
      validateApiTokenUseCase: makeValidateApiTokenUseCase(),
      validateMcpOAuthAccessTokenUseCase: makeValidateMcpOAuthAccessTokenUseCase(
        vi.fn().mockResolvedValue({
          sub: 'user-1',
          scope: 'full',
          grantId: 'grant-1',
          clientName: 'Claude Desktop',
        }),
      ),
    });

    await expect(useCase.execute('trakwyn_mcp_access')).resolves.toBeNull();
  });

  it('rejects an OAuth token when no OAuth validator is wired in', async () => {
    const useCase = new AuthenticateMcpRequestUseCase({
      entitlementService: makeEntitlementService(),
      validateApiTokenUseCase: makeValidateApiTokenUseCase(),
    });

    await expect(useCase.execute('trakwyn_mcp_access')).resolves.toBeNull();
  });
});
