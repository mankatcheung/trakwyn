import { describe, it, expect, vi } from 'vitest';
import { LoginOrSignupWithOAuthUseCase } from '#src/use-cases/oauth/LoginOrSignupWithOAuthUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
  makeOAuthProvider,
  makeOAuthProviderRegistry,
} from '#src/__tests__/helpers/mocks/oauth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { makeEmailVerificationTokenRepository } from '#src/__tests__/helpers/mocks/auth.js';

const input = {
  provider: 'google' as const,
  code: 'auth-code',
  redirectUri: 'https://api/cb',
  codeVerifier: 'test-verifier',
};

const takeoverDeps = () => ({
  sessionRepository: makeSessionRepository(),
  emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
});

describe('LoginOrSignupWithOAuthUseCase', () => {
  it('logs in the existing user when the provider identity is already linked', async () => {
    const user = makeUser({ id: 'user-1' });
    const link = makeOAuthAccount({ userId: 'user-1' });
    const useCase = new LoginOrSignupWithOAuthUseCase({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
      oauthAccountRepository: makeOAuthAccountRepository({
        findByProvider: vi.fn().mockResolvedValue(link),
      }),
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn(),
      ...takeoverDeps(),
    });

    const result = await useCase.execute(input);

    expect(result).toEqual({ user, isNewUser: false });
  });

  it('throws NOT_FOUND when a linked account points at a missing user', async () => {
    const link = makeOAuthAccount({ userId: 'ghost' });
    const useCase = new LoginOrSignupWithOAuthUseCase({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(null) }),
      oauthAccountRepository: makeOAuthAccountRepository({
        findByProvider: vi.fn().mockResolvedValue(link),
      }),
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn(),
      ...takeoverDeps(),
    });

    const err = await useCase.execute(input).catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws VALIDATION when the provider does not report a verified email', async () => {
    const oauthProviderRegistry = makeOAuthProviderRegistry({
      get: vi.fn().mockReturnValue(
        makeOAuthProvider({
          exchangeCodeForProfile: vi.fn().mockResolvedValue({
            providerAccountId: 'sub-1',
            email: null,
            emailVerified: false,
            name: null,
          }),
        }),
      ),
    });
    const useCase = new LoginOrSignupWithOAuthUseCase({
      userRepository: makeUserRepository(),
      oauthAccountRepository: makeOAuthAccountRepository(),
      oauthProviderRegistry,
      generateId: vi.fn(),
      ...takeoverDeps(),
    });

    const err = await useCase.execute(input).catch((e) => e);
    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws CONFLICT instead of silently linking when the email already belongs to a verified account', async () => {
    const existingUser = makeUser({
      id: 'user-1',
      email: 'test@example.com',
      emailVerifiedAt: new Date(),
    });
    const useCase = new LoginOrSignupWithOAuthUseCase({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(existingUser),
      }),
      oauthAccountRepository: makeOAuthAccountRepository(),
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn(),
      ...takeoverDeps(),
    });

    const err = await useCase.execute(input).catch((e) => e);
    expect((err as { code: string }).code).toBe('CONFLICT');
  });

  it('creates a new passwordless, pre-verified user and links the identity on first sign-in', async () => {
    const createdUser = makeUser({ id: 'new-user', passwordHash: null });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(createdUser),
    });
    const oauthAccountRepository = makeOAuthAccountRepository();
    const useCase = new LoginOrSignupWithOAuthUseCase({
      userRepository,
      oauthAccountRepository,
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn().mockReturnValueOnce('new-user').mockReturnValueOnce('link-1'),
      ...takeoverDeps(),
    });

    const result = await useCase.execute(input);

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-user',
        email: 'test@example.com',
        passwordHash: null,
        name: 'Jeff Man',
        emailVerifiedAt: expect.any(Date) as Date,
      }),
    );
    expect(oauthAccountRepository.create).toHaveBeenCalledWith({
      id: 'link-1',
      userId: 'new-user',
      provider: 'google',
      providerAccountId: 'google-sub-1',
      email: 'test@example.com',
    });
    expect(result).toEqual({ user: createdUser, isNewUser: true });
  });

  describe('an unverified account already holds the email (JEF-438)', () => {
    // Someone registered `test@example.com` with a password and never proved
    // they own it. The provider has just proved the signed-in person does, so
    // the account is theirs: it is taken over, and whatever the squatter set
    // up (password, 2FA, backup address, sessions) is removed.
    const squatter = makeUser({
      id: 'squatter',
      email: 'test@example.com',
      passwordHash: 'attacker-chosen-hash',
      emailVerifiedAt: null,
      totpEnabled: true,
      totpSecret: 'secret',
      backupEmail: 'attacker@evil.example',
    });

    const setup = () => {
      const verifiedUser = makeUser({ id: 'squatter', passwordHash: null });
      const userRepository = makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(squatter),
        update: vi.fn().mockResolvedValue(verifiedUser),
      });
      const oauthAccountRepository = makeOAuthAccountRepository();
      const deps = takeoverDeps();
      const useCase = new LoginOrSignupWithOAuthUseCase({
        userRepository,
        oauthAccountRepository,
        oauthProviderRegistry: makeOAuthProviderRegistry(),
        generateId: vi.fn().mockReturnValue('link-1'),
        ...deps,
      });
      return { useCase, userRepository, oauthAccountRepository, verifiedUser, ...deps };
    };

    it('clears the password, 2FA and backup email and marks the account verified', async () => {
      const { useCase, userRepository } = setup();

      await useCase.execute(input);

      expect(userRepository.update).toHaveBeenCalledWith('squatter', {
        passwordHash: null,
        totpSecret: null,
        totpEnabled: false,
        backupEmail: null,
        backupEmailVerifiedAt: null,
        emailVerifiedAt: expect.any(Date) as Date,
      });
    });

    it('revokes every session and pending verification link', async () => {
      const { useCase, sessionRepository, emailVerificationTokenRepository } = setup();

      await useCase.execute(input);

      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith('squatter');
      expect(emailVerificationTokenRepository.deleteAllForUser).toHaveBeenCalledWith('squatter');
    });

    it('links the provider identity and signs the account in as existing', async () => {
      const { useCase, oauthAccountRepository, verifiedUser } = setup();

      const result = await useCase.execute(input);

      expect(oauthAccountRepository.create).toHaveBeenCalledWith({
        id: 'link-1',
        userId: 'squatter',
        provider: 'google',
        providerAccountId: 'google-sub-1',
        email: 'test@example.com',
      });
      expect(result).toEqual({ user: verifiedUser, isNewUser: false });
    });

    it('does not touch the account when the provider did not vouch for the email', async () => {
      const userRepository = makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(squatter),
      });
      const deps = takeoverDeps();
      const useCase = new LoginOrSignupWithOAuthUseCase({
        userRepository,
        oauthAccountRepository: makeOAuthAccountRepository(),
        oauthProviderRegistry: makeOAuthProviderRegistry({
          get: vi.fn().mockReturnValue(
            makeOAuthProvider({
              exchangeCodeForProfile: vi.fn().mockResolvedValue({
                providerAccountId: 'sub-1',
                email: 'test@example.com',
                emailVerified: false,
                name: null,
              }),
            }),
          ),
        }),
        generateId: vi.fn(),
        ...deps,
      });

      const err = await useCase.execute(input).catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(deps.sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
