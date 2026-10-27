import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { DrizzleTransactionManager } from '#src/infrastructure/db/DrizzleTransactionManager.js';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { DrizzleSessionRepository } from '#src/infrastructure/db/repositories/DrizzleSessionRepository.js';
import { DrizzlePasswordResetTokenRepository } from '#src/infrastructure/db/repositories/DrizzlePasswordResetTokenRepository.js';
import { DrizzleEmailVerificationTokenRepository } from '#src/infrastructure/db/repositories/DrizzleEmailVerificationTokenRepository.js';
import { DrizzleSecurityEventRepository } from '#src/infrastructure/db/repositories/DrizzleSecurityEventRepository.js';
import { DrizzleOAuthAccountRepository } from '#src/infrastructure/db/repositories/DrizzleOAuthAccountRepository.js';
import { DrizzleTotpBackupCodeRepository } from '#src/infrastructure/db/repositories/DrizzleTotpBackupCodeRepository.js';
import { DrizzleLlmApiKeyRepository } from '#src/infrastructure/db/repositories/DrizzleLlmApiKeyRepository.js';
import { DrizzlePushSubscriptionRepository } from '#src/infrastructure/db/repositories/DrizzlePushSubscriptionRepository.js';
import { DrizzleMcpOAuthClientRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthClientRepository.js';
import { DrizzleMcpOAuthAuthorizationCodeRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthAuthorizationCodeRepository.js';
import { DrizzleMcpOAuthRefreshTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthRefreshTokenRepository.js';
import { DrizzleMcpOAuthTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthTokenRepository.js';
import { ResetPasswordUseCase } from '#src/use-cases/auth/ResetPasswordUseCase.js';
import { ConfirmEmailChangeUseCase } from '#src/use-cases/user/ConfirmEmailChangeUseCase.js';
import { LoginOrSignupWithOAuthUseCase } from '#src/use-cases/oauth/LoginOrSignupWithOAuthUseCase.js';
import { RegenerateTotpBackupCodesUseCase } from '#src/use-cases/user/RegenerateTotpBackupCodesUseCase.js';
import { ExchangeMcpOAuthAuthorizationCodeUseCase } from '#src/use-cases/mcpOAuth/ExchangeMcpOAuthAuthorizationCodeUseCase.js';
import { RotateMcpOAuthRefreshTokenUseCase } from '#src/use-cases/mcpOAuth/RotateMcpOAuthRefreshTokenUseCase.js';
import { MCP_OAUTH } from '#src/use-cases/constants.js';

/**
 * JEF-427: use cases that write through several repositories must commit or
 * roll back as one. Each case injects a failing dependency for the *last*
 * write and asserts the earlier ones did not persist. Everything else is the
 * real repositories on real (PGlite) Postgres: the mocked-repository unit
 * tests cannot show a rollback.
 */

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const boom = (): never => {
  throw new Error('simulated failure');
};
/** The real repository with one method replaced by a failure (a spread would drop the prototype). */
const failing = <T extends object>(repo: T, method: keyof T & string): T =>
  Object.assign(Object.create(repo), { [method]: boom });

describe('use-case transactions (JEF-427)', () => {
  let testDb: TestDb;
  let tm: DrizzleTransactionManager;
  let users: DrizzleUserRepository;
  let sessions: DrizzleSessionRepository;
  let resetTokens: DrizzlePasswordResetTokenRepository;
  let emailTokens: DrizzleEmailVerificationTokenRepository;
  let securityEvents: DrizzleSecurityEventRepository;
  let oauthAccounts: DrizzleOAuthAccountRepository;
  let backupCodes: DrizzleTotpBackupCodeRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    const { db } = testDb;
    tm = new DrizzleTransactionManager({ db });
    users = new DrizzleUserRepository({ db });
    sessions = new DrizzleSessionRepository({ db });
    resetTokens = new DrizzlePasswordResetTokenRepository({ db });
    emailTokens = new DrizzleEmailVerificationTokenRepository({ db });
    securityEvents = new DrizzleSecurityEventRepository({ db });
    oauthAccounts = new DrizzleOAuthAccountRepository({ db });
    backupCodes = new DrizzleTotpBackupCodeRepository({ db });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser(passwordHash: string | null = 'old-hash') {
    const id = nanoid();
    await users.create({ id, email: `${id}@example.com`, passwordHash });
    return id;
  }

  describe('ResetPasswordUseCase', () => {
    async function seed() {
      const userId = await makeUser();
      await sessions.create({
        id: nanoid(),
        userId,
        userAgent: null,
        ipAddress: null,
        deviceLabel: null,
        location: null,
        expiresAt: new Date(Date.now() + 60_000),
        currentRefreshTokenId: nanoid(),
      });
      const raw = nanoid();
      await resetTokens.create({
        id: nanoid(),
        userId,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 60_000),
      });
      return { userId, raw };
    }

    it('rolls the password change back when revoking sessions fails', async () => {
      const { userId, raw } = await seed();
      const useCase = new ResetPasswordUseCase({
        userRepository: users,
        passwordResetTokenRepository: resetTokens,
        sessionRepository: failing(sessions, 'revokeAllForUser') as never,
        transactionManager: tm,
      });

      await expect(
        useCase.execute({ token: raw, newPassword: 'Str0ng!Passw0rd#1' }),
      ).rejects.toThrow('simulated failure');

      expect((await users.findById(userId))!.passwordHash).toBe('old-hash');
      expect((await resetTokens.findByTokenHash(sha256(raw)))!.usedAt).toBeNull();
    });

    it('commits all three writes on success', async () => {
      const { userId, raw } = await seed();
      const useCase = new ResetPasswordUseCase({
        userRepository: users,
        passwordResetTokenRepository: resetTokens,
        sessionRepository: sessions,
        transactionManager: tm,
      });

      await useCase.execute({ token: raw, newPassword: 'Str0ng!Passw0rd#1' });

      expect((await users.findById(userId))!.passwordHash).not.toBe('old-hash');
      expect((await resetTokens.findByTokenHash(sha256(raw)))!.usedAt).not.toBeNull();
      expect(await sessions.findActiveByUserId(userId)).toHaveLength(0);
    });
  });

  describe('ConfirmEmailChangeUseCase', () => {
    it('rolls the email change back when the audit row cannot be written', async () => {
      const userId = await makeUser();
      const before = (await users.findById(userId))!.email;
      const newEmail = `${nanoid()}@new.example.com`;
      const raw = nanoid();
      await emailTokens.create({
        id: nanoid(),
        userId,
        tokenHash: sha256(raw),
        newEmail,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const useCase = new ConfirmEmailChangeUseCase({
        userRepository: users,
        emailVerificationTokenRepository: emailTokens,
        securityEventRepository: failing(securityEvents, 'create') as never,
        generateId: nanoid,
        transactionManager: tm,
      });

      await expect(useCase.execute({ token: raw })).rejects.toThrow('simulated failure');

      expect((await users.findById(userId))!.email).toBe(before);
      expect((await emailTokens.findByTokenHash(sha256(raw)))!.usedAt).toBeNull();
    });
  });

  describe('LoginOrSignupWithOAuthUseCase', () => {
    it('does not leave a user behind when linking the OAuth account fails', async () => {
      const email = `${nanoid()}@oauth.example.com`;
      const useCase = new LoginOrSignupWithOAuthUseCase({
        userRepository: users,
        oauthAccountRepository: failing(oauthAccounts, 'create') as never,
        oauthProviderRegistry: {
          get: () => ({
            exchangeCodeForProfile: async () => ({
              providerAccountId: nanoid(),
              email,
              emailVerified: true,
              name: 'New User',
            }),
          }),
        } as never,
        sessionRepository: sessions,
        emailVerificationTokenRepository: emailTokens,
        generateId: nanoid,
        transactionManager: tm,
      });

      await expect(
        useCase.execute({ provider: 'google', code: 'c', redirectUri: 'r', codeVerifier: 'v' }),
      ).rejects.toThrow('simulated failure');

      expect(await users.findByEmail(email)).toBeNull();
    });

    it('leaves an unverified account untouched when taking it over fails (JEF-438)', async () => {
      const userId = await makeUser('attacker-hash');
      const email = (await users.findById(userId))!.email;
      const useCase = new LoginOrSignupWithOAuthUseCase({
        userRepository: users,
        oauthAccountRepository: failing(oauthAccounts, 'create') as never,
        oauthProviderRegistry: {
          get: () => ({
            exchangeCodeForProfile: async () => ({
              providerAccountId: nanoid(),
              email,
              emailVerified: true,
              name: null,
            }),
          }),
        } as never,
        sessionRepository: sessions,
        emailVerificationTokenRepository: emailTokens,
        generateId: nanoid,
        transactionManager: tm,
      });

      await expect(
        useCase.execute({ provider: 'google', code: 'c', redirectUri: 'r', codeVerifier: 'v' }),
      ).rejects.toThrow('simulated failure');

      const after = (await users.findById(userId))!;
      expect(after.passwordHash).toBe('attacker-hash');
      expect(after.emailVerifiedAt).toBeNull();
    });
  });

  describe('RegenerateTotpBackupCodesUseCase', () => {
    it('keeps the old backup codes when creating the new ones fails', async () => {
      const passwordHash = await bcrypt.hash('Current-Passw0rd!', 4);
      const userId = await makeUser(passwordHash);
      await users.update(userId, { totpEnabled: true });
      await backupCodes.create({ id: nanoid(), userId, codeHash: sha256('old-code') });

      const useCase = new RegenerateTotpBackupCodesUseCase({
        userRepository: users,
        totpBackupCodeRepository: failing(backupCodes, 'create'),
        securityEventRepository: securityEvents,
        generateId: nanoid,
        transactionManager: tm,
      });

      await expect(
        useCase.execute({ userId, currentPassword: 'Current-Passw0rd!', authTime: Date.now() }),
      ).rejects.toThrow('simulated failure');

      expect(await backupCodes.findByCodeHash(sha256('old-code'))).not.toBeNull();
    });
  });

  describe('MCP OAuth token use cases', () => {
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const now = () => new Date();

    async function seedGrant() {
      const { db } = testDb;
      const userId = await makeUser();
      const clientId = nanoid();
      await new DrizzleMcpOAuthClientRepository({ db }).create({
        id: clientId,
        name: 'test client',
        redirectUris: ['https://client.example/cb'],
      });
      return {
        userId,
        clientId,
        familyId: nanoid(),
        codes: new DrizzleMcpOAuthAuthorizationCodeRepository({ db }),
        refreshTokens: new DrizzleMcpOAuthRefreshTokenRepository({ db }),
        accessTokens: new DrizzleMcpOAuthTokenRepository({ db }),
        clients: new DrizzleMcpOAuthClientRepository({ db }),
      };
    }

    function exchangeUseCase(
      g: Awaited<ReturnType<typeof seedGrant>>,
      refreshIssuer: { execute: () => Promise<never> },
    ) {
      return new ExchangeMcpOAuthAuthorizationCodeUseCase({
        mcpOAuthClientRepository: g.clients,
        mcpOAuthAuthorizationCodeRepository: g.codes,
        mcpOAuthTokenRepository: g.accessTokens,
        mcpOAuthRefreshTokenRepository: g.refreshTokens,
        createMcpOAuthAccessTokenUseCase: {
          execute: async () => ({ rawToken: 'a', token: {} }),
        },
        createMcpOAuthRefreshTokenUseCase: refreshIssuer,
        securityEventRepository: securityEvents,
        generateId: nanoid,
        now,
        transactionManager: tm,
      } as never);
    }

    async function seedCode(g: Awaited<ReturnType<typeof seedGrant>>, consumed: boolean) {
      const raw = `${MCP_OAUTH.AUTHORIZATION_CODE_PREFIX}${nanoid()}`;
      const created = await g.codes.create({
        id: nanoid(),
        codeHash: sha256(raw),
        familyId: g.familyId,
        clientId: g.clientId,
        userId: g.userId,
        redirectUri: 'https://client.example/cb',
        scope: 'read',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        expiresAt: new Date(Date.now() + 60_000),
      });
      if (consumed) await g.codes.consume(created.id, new Date());
      return raw;
    }

    it('gives the authorization code back when minting the refresh token fails', async () => {
      const g = await seedGrant();
      const raw = await seedCode(g, false);
      const useCase = exchangeUseCase(g, { execute: async () => boom() });

      await expect(
        useCase.execute({
          code: raw,
          codeVerifier: verifier,
          clientId: g.clientId,
          redirectUri: 'https://client.example/cb',
        }),
      ).rejects.toThrow('simulated failure');

      expect((await g.codes.findByCodeHash(sha256(raw)))!.consumedAt).toBeNull();
    });

    it('still commits the grant revocation when a consumed code is replayed', async () => {
      const g = await seedGrant();
      const refreshRaw = `${MCP_OAUTH.REFRESH_TOKEN_PREFIX}${nanoid()}`;
      await g.refreshTokens.create({
        id: nanoid(),
        tokenHash: sha256(refreshRaw),
        familyId: g.familyId,
        clientId: g.clientId,
        userId: g.userId,
        scope: 'read',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const raw = await seedCode(g, true);
      const useCase = exchangeUseCase(g, { execute: async () => boom() });

      const result = await useCase.execute({
        code: raw,
        codeVerifier: verifier,
        clientId: g.clientId,
        redirectUri: 'https://client.example/cb',
      });

      expect(result).toBeNull();
      expect((await g.refreshTokens.findByTokenHash(sha256(refreshRaw)))!.revokedAt).not.toBeNull();
      const events = await securityEvents.findRecentByUserId(g.userId, 10);
      expect(events.map((e) => e.eventType)).toContain('mcp_oauth_code_reuse_detected');
    });

    function rotateUseCase(
      g: Awaited<ReturnType<typeof seedGrant>>,
      refreshIssuer: { execute: () => Promise<never> },
    ) {
      return new RotateMcpOAuthRefreshTokenUseCase({
        mcpOAuthRefreshTokenRepository: g.refreshTokens,
        mcpOAuthClientRepository: g.clients,
        mcpOAuthTokenRepository: g.accessTokens,
        createMcpOAuthAccessTokenUseCase: {
          execute: async () => ({ rawToken: 'a', token: { expiresAt: new Date() } }),
        },
        createMcpOAuthRefreshTokenUseCase: refreshIssuer,
        securityEventRepository: securityEvents,
        generateId: nanoid,
        now,
        transactionManager: tm,
      } as never);
    }

    async function seedRefresh(g: Awaited<ReturnType<typeof seedGrant>>) {
      const raw = `${MCP_OAUTH.REFRESH_TOKEN_PREFIX}${nanoid()}`;
      await g.refreshTokens.create({
        id: nanoid(),
        tokenHash: sha256(raw),
        familyId: g.familyId,
        clientId: g.clientId,
        userId: g.userId,
        scope: 'read',
        expiresAt: new Date(Date.now() + 60_000),
      });
      return raw;
    }

    it('leaves the presented refresh token usable when minting its replacement fails', async () => {
      const g = await seedGrant();
      const raw = await seedRefresh(g);
      const useCase = rotateUseCase(g, { execute: async () => boom() });

      await expect(useCase.execute({ refreshToken: raw, clientId: g.clientId })).rejects.toThrow(
        'simulated failure',
      );

      expect((await g.refreshTokens.findByTokenHash(sha256(raw)))!.usedAt).toBeNull();
    });

    it('still commits the family revocation when a used refresh token is replayed', async () => {
      const g = await seedGrant();
      const raw = await seedRefresh(g);
      const stored = (await g.refreshTokens.findByTokenHash(sha256(raw)))!;
      await g.refreshTokens.markUsed(stored.id, new Date());
      const useCase = rotateUseCase(g, { execute: async () => boom() });

      expect(await useCase.execute({ refreshToken: raw, clientId: g.clientId })).toBeNull();

      expect((await g.refreshTokens.findByTokenHash(sha256(raw)))!.revokedAt).not.toBeNull();
      const events = await securityEvents.findRecentByUserId(g.userId, 10);
      expect(events.map((e) => e.eventType)).toContain('mcp_oauth_refresh_reuse_detected');
    });
  });
});

describe('repository transaction participation (JEF-427)', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('DrizzlePushSubscriptionRepository writes roll back with an ambient transaction', async () => {
    const { db } = testDb;
    const tm = new DrizzleTransactionManager({ db });
    const users = new DrizzleUserRepository({ db });
    const push = new DrizzlePushSubscriptionRepository({ db, generateId: nanoid });
    const userId = nanoid();
    await users.create({ id: userId, email: `${userId}@example.com`, passwordHash: 'h' });
    const endpoint = `https://push.example/${nanoid()}`;

    await expect(
      tm.run(async () => {
        await push.upsert({
          id: nanoid(),
          userId,
          provider: 'webpush',
          endpoint,
          p256dh: 'k',
          auth: 'a',
        } as never);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');

    expect(await push.findByEndpoint(endpoint)).toBeNull();
  });

  it('DrizzleLlmApiKeyRepository.upsert is atomic under concurrent saves and keeps the token limit', async () => {
    const { db } = testDb;
    const users = new DrizzleUserRepository({ db });
    const keys = new DrizzleLlmApiKeyRepository({ db });
    const userId = nanoid();
    await users.create({ id: userId, email: `${userId}@example.com`, passwordHash: 'h' });
    const data = (apiKey: string) => ({
      id: nanoid(),
      userId,
      provider: 'openai',
      apiKey,
      model: null,
      baseUrl: null,
    });

    await keys.upsert(data('first'));
    await keys.setMonthlyTokenLimit(userId, 'openai', 5000);
    await Promise.all([keys.upsert(data('second')), keys.upsert(data('third'))]);

    const all = await keys.findAllByUserId(userId);
    expect(all).toHaveLength(1);
    expect(['second', 'third']).toContain(all[0].apiKey);
    expect(all[0].monthlyTokenLimit).toBe(5000);
  });
});
