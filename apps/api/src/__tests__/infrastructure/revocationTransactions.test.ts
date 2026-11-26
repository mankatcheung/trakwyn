import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { DrizzleTransactionManager } from '#src/infrastructure/db/DrizzleTransactionManager.js';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { DrizzleSessionRepository } from '#src/infrastructure/db/repositories/DrizzleSessionRepository.js';
import { DrizzleSecurityEventRepository } from '#src/infrastructure/db/repositories/DrizzleSecurityEventRepository.js';
import { DrizzleApiTokenRepository } from '#src/infrastructure/db/repositories/DrizzleApiTokenRepository.js';
import { DrizzleUserActionTokenRepository } from '#src/infrastructure/db/repositories/DrizzleUserActionTokenRepository.js';
import { DrizzleBackupEmailVerificationTokenRepository } from '#src/infrastructure/db/repositories/DrizzleBackupEmailVerificationTokenRepository.js';
import { DrizzleTotpBackupCodeRepository } from '#src/infrastructure/db/repositories/DrizzleTotpBackupCodeRepository.js';
import { DrizzleMcpOAuthClientRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthClientRepository.js';
import { DrizzleMcpOAuthAuthorizationCodeRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthAuthorizationCodeRepository.js';
import { DrizzleMcpOAuthRefreshTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthRefreshTokenRepository.js';
import { DrizzleMcpOAuthTokenRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthTokenRepository.js';
import { DrizzleMcpOAuthGrantRepository } from '#src/infrastructure/db/repositories/DrizzleMcpOAuthGrantRepository.js';
import { CancelAccountDeletionUseCase } from '#src/use-cases/user/CancelAccountDeletionUseCase.js';
import { ConfirmAccountDeletionUseCase } from '#src/use-cases/user/ConfirmAccountDeletionUseCase.js';
import { RemoveBackupEmailUseCase } from '#src/use-cases/user/RemoveBackupEmailUseCase.js';
import { RevokeOtherSessionsUseCase } from '#src/use-cases/sessions/RevokeOtherSessionsUseCase.js';
import { RevokeMcpOAuthGrantUseCase } from '#src/use-cases/mcpOAuth/RevokeMcpOAuthGrantUseCase.js';
import { RevokeMcpOAuthGrantForUserUseCase } from '#src/use-cases/mcpOAuth/RevokeMcpOAuthGrantForUserUseCase.js';
import { ExchangeMcpOAuthAuthorizationCodeUseCase } from '#src/use-cases/mcpOAuth/ExchangeMcpOAuthAuthorizationCodeUseCase.js';
import { RotateMcpOAuthRefreshTokenUseCase } from '#src/use-cases/mcpOAuth/RotateMcpOAuthRefreshTokenUseCase.js';
import { verifyTotpOrBackupCode } from '#src/use-cases/auth/verifyTotpOrBackupCode.js';
import { hashLinkToken } from '#src/use-cases/shared/actionTokens.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const boom = (): never => {
  throw new Error('simulated failure');
};
/** The real repository with one method replaced by a failure (a spread would drop the prototype). */
const failing = <T extends object>(repo: T, method: keyof T & string): T =>
  Object.assign(Object.create(repo), { [method]: boom });

const inOneMinute = () => new Date(Date.now() + 60_000);
const now = () => new Date();

/**
 * JEF-694: the account-deletion and revocation writes that JEF-427 left apart.
 * Same method as `useCaseTransactions.test.ts`: real repositories on PGlite,
 * one write made to fail, and the earlier ones must not have persisted.
 */
describe('revocation and account-deletion transactions (JEF-694)', () => {
  let testDb: TestDb;
  let tm: DrizzleTransactionManager;
  let users: DrizzleUserRepository;
  let sessions: DrizzleSessionRepository;
  let securityEvents: DrizzleSecurityEventRepository;
  let apiTokens: DrizzleApiTokenRepository;
  let actionTokens: DrizzleUserActionTokenRepository;
  let backupEmailTokens: DrizzleBackupEmailVerificationTokenRepository;
  let backupCodes: DrizzleTotpBackupCodeRepository;
  let clients: DrizzleMcpOAuthClientRepository;
  let codes: DrizzleMcpOAuthAuthorizationCodeRepository;
  let refreshTokens: DrizzleMcpOAuthRefreshTokenRepository;
  let accessTokens: DrizzleMcpOAuthTokenRepository;
  let grants: DrizzleMcpOAuthGrantRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    const { db } = testDb;
    tm = new DrizzleTransactionManager({ db });
    users = new DrizzleUserRepository({ db });
    sessions = new DrizzleSessionRepository({ db });
    securityEvents = new DrizzleSecurityEventRepository({ db });
    apiTokens = new DrizzleApiTokenRepository({ db });
    actionTokens = new DrizzleUserActionTokenRepository({ db });
    backupEmailTokens = new DrizzleBackupEmailVerificationTokenRepository({ db });
    backupCodes = new DrizzleTotpBackupCodeRepository({ db });
    clients = new DrizzleMcpOAuthClientRepository({ db });
    codes = new DrizzleMcpOAuthAuthorizationCodeRepository({ db });
    refreshTokens = new DrizzleMcpOAuthRefreshTokenRepository({ db });
    accessTokens = new DrizzleMcpOAuthTokenRepository({ db });
    grants = new DrizzleMcpOAuthGrantRepository({ db });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser() {
    const id = nanoid();
    await users.create({ id, email: `${id}@example.com`, passwordHash: 'stored-hash' });
    return id;
  }

  async function seedSession(userId: string) {
    const id = nanoid();
    await sessions.create({
      id,
      userId,
      userAgent: null,
      ipAddress: null,
      deviceLabel: null,
      location: null,
      expiresAt: inOneMinute(),
      currentRefreshTokenId: nanoid(),
    });
    return id;
  }

  // Prefixes are spelled out: reading them from the constants makes CodeQL take
  // these random tokens for passwords hashed too cheaply.
  /** A live MCP grant: the consent, one access token and one refresh token. */
  async function seedGrant(userId?: string) {
    const ownerId = userId ?? (await makeUser());
    const clientId = nanoid();
    const familyId = nanoid();
    await clients.create({
      id: clientId,
      name: 'test client',
      redirectUris: ['https://client.example/cb'],
    });
    const code = `trakwyn_mcp_code_${nanoid()}`;
    const consent = await codes.create({
      id: nanoid(),
      codeHash: sha256(code),
      familyId,
      clientId,
      userId: ownerId,
      redirectUri: 'https://client.example/cb',
      scope: 'read',
      codeChallenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'),
      codeChallengeMethod: 'S256',
      expiresAt: inOneMinute(),
    });
    await codes.consume(consent.id, new Date());
    const shared = { familyId, clientId, userId: ownerId, scope: 'read' as const };
    const access = `trakwyn_mcp_${nanoid()}`;
    await accessTokens.create({
      id: nanoid(),
      tokenHash: sha256(access),
      audience: '/mcp',
      expiresAt: inOneMinute(),
      ...shared,
    });
    const refresh = `trakwyn_mcp_refresh_${nanoid()}`;
    await refreshTokens.create({
      id: nanoid(),
      tokenHash: sha256(refresh),
      expiresAt: inOneMinute(),
      ...shared,
    });
    return { userId: ownerId, clientId, familyId, code, access, refresh };
  }

  async function expectGrantLive(grant: { access: string; refresh: string }) {
    expect((await accessTokens.findByTokenHash(sha256(grant.access)))!.revokedAt).toBeNull();
    expect((await refreshTokens.findByTokenHash(sha256(grant.refresh)))!.revokedAt).toBeNull();
  }

  const eventTypes = async (userId: string) =>
    (await securityEvents.findRecentByUserId(userId, 10)).map((event) => event.eventType);

  describe('CancelAccountDeletionUseCase', () => {
    it('keeps the deletion scheduled, and the link, when the audit row cannot be written', async () => {
      const userId = await makeUser();
      await users.update(userId, { deletionScheduledAt: inOneMinute() });
      const raw = nanoid();
      await actionTokens.issue({
        id: nanoid(),
        userId,
        purpose: 'account_deletion_cancel',
        tokenHash: hashLinkToken(raw),
        expiresAt: inOneMinute(),
      });
      const resumeSubscription = vi.fn();
      const useCase = new CancelAccountDeletionUseCase({
        userRepository: users,
        userActionTokenRepository: actionTokens,
        securityEventRepository: failing(securityEvents, 'create'),
        billingProvider: { resumeSubscription },
        emailService: {},
        logger: { error: vi.fn() },
        generateId: nanoid,
        transactionManager: tm,
      } as never);

      await expect(useCase.execute({ token: raw })).rejects.toThrow('simulated failure');

      expect((await users.findById(userId))!.deletionScheduledAt).not.toBeNull();
      expect(
        await actionTokens.findByTokenHash('account_deletion_cancel', hashLinkToken(raw)),
      ).not.toBeNull();
    });
  });

  describe('ConfirmAccountDeletionUseCase', () => {
    it('schedules nothing and leaves the link unused when an MCP revoke fails', async () => {
      const userId = await makeUser();
      const sessionId = await seedSession(userId);
      const grant = await seedGrant(userId);
      await apiTokens.create({
        id: nanoid(),
        userId,
        name: 'cli',
        tokenHash: sha256(nanoid()),
        scope: 'read',
      });
      const raw = nanoid();
      await actionTokens.issue({
        id: nanoid(),
        userId,
        purpose: 'account_deletion_confirm',
        tokenHash: hashLinkToken(raw),
        expiresAt: inOneMinute(),
      });
      const useCase = new ConfirmAccountDeletionUseCase({
        userRepository: users,
        userActionTokenRepository: actionTokens,
        sessionRepository: sessions,
        apiTokenRepository: apiTokens,
        mcpOAuthGrantRepository: grants,
        mcpOAuthTokenRepository: accessTokens,
        mcpOAuthRefreshTokenRepository: failing(refreshTokens, 'revokeFamily'),
        securityEventRepository: securityEvents,
        billingProvider: {},
        emailService: { sendAccountDeletionScheduled: vi.fn() },
        logger: { error: vi.fn() },
        generateId: nanoid,
        webAppOrigin: 'https://app.example',
        transactionManager: tm,
      } as never);

      await expect(useCase.execute({ token: raw })).rejects.toThrow('simulated failure');

      expect((await users.findById(userId))!.deletionScheduledAt).toBeNull();
      expect(
        (await actionTokens.findByTokenHash('account_deletion_confirm', hashLinkToken(raw)))!
          .usedAt,
      ).toBeNull();
      expect((await sessions.findById(sessionId))!.revokedAt).toBeNull();
      expect(await apiTokens.findAllByUserId(userId)).toHaveLength(1);
      await expectGrantLive(grant);
      expect(await eventTypes(userId)).not.toContain('account_deletion_scheduled');
    });
  });

  describe('RemoveBackupEmailUseCase', () => {
    it('keeps the address when the pending confirmations cannot be deleted', async () => {
      const userId = await makeUser();
      const backupEmail = `${nanoid()}@backup.example`.toLowerCase();
      await users.update(userId, { backupEmail, backupEmailVerifiedAt: new Date() });
      const useCase = new RemoveBackupEmailUseCase({
        passwordHasher: makePasswordHasher(),
        userRepository: users,
        backupEmailVerificationTokenRepository: failing(backupEmailTokens, 'deleteAllForUser'),
        removeBackupEmailRateLimiter: { consume: async () => true },
        transactionManager: tm,
      } as never);

      await expect(
        useCase.execute({ userId, currentPassword: 'Current-Passw0rd!', authTime: Date.now() }),
      ).rejects.toThrow('simulated failure');

      expect((await users.findById(userId))!.backupEmail).toBe(backupEmail);
    });
  });

  describe('RevokeOtherSessionsUseCase', () => {
    it('leaves the other sessions signed in when the audit row cannot be written', async () => {
      const userId = await makeUser();
      const current = await seedSession(userId);
      const other = await seedSession(userId);
      const useCase = new RevokeOtherSessionsUseCase({
        sessionRepository: sessions,
        securityEventRepository: failing(securityEvents, 'create'),
        generateId: nanoid,
        transactionManager: tm,
      } as never);

      await expect(useCase.execute(userId, current)).rejects.toThrow('simulated failure');

      expect((await sessions.findById(other))!.revokedAt).toBeNull();
    });
  });

  describe('MCP revocation', () => {
    it('RFC 7009 revoke leaves both halves live when the second cannot be revoked', async () => {
      const grant = await seedGrant();
      const useCase = new RevokeMcpOAuthGrantUseCase({
        mcpOAuthTokenRepository: accessTokens,
        mcpOAuthRefreshTokenRepository: failing(refreshTokens, 'revokeFamily'),
        now,
        transactionManager: tm,
      } as never);

      await expect(useCase.execute(grant.access)).rejects.toThrow('simulated failure');

      await expectGrantLive(grant);
    });

    it('revoke from settings leaves the grant live when the audit row cannot be written', async () => {
      const grant = await seedGrant();
      const useCase = new RevokeMcpOAuthGrantForUserUseCase({
        mcpOAuthGrantRepository: grants,
        mcpOAuthTokenRepository: accessTokens,
        mcpOAuthRefreshTokenRepository: refreshTokens,
        securityEventRepository: failing(securityEvents, 'create'),
        generateId: nanoid,
        now,
        transactionManager: tm,
      } as never);

      await expect(useCase.execute(grant.userId, grant.familyId)).rejects.toThrow(
        'simulated failure',
      );

      await expectGrantLive(grant);
    });

    it('refresh-token reuse can be detected again when revoking the access side fails', async () => {
      const grant = await seedGrant();
      const stored = (await refreshTokens.findByTokenHash(sha256(grant.refresh)))!;
      await refreshTokens.markUsed(stored.id, new Date());
      const useCase = new RotateMcpOAuthRefreshTokenUseCase({
        mcpOAuthRefreshTokenRepository: refreshTokens,
        mcpOAuthClientRepository: clients,
        mcpOAuthTokenRepository: failing(accessTokens, 'revokeFamily'),
        securityEventRepository: securityEvents,
        generateId: nanoid,
        now,
        transactionManager: tm,
      } as never);

      await expect(
        useCase.execute({ refreshToken: grant.refresh, clientId: grant.clientId }),
      ).rejects.toThrow('simulated failure');

      // A revoked refresh token is turned away before reuse detection runs, so
      // a half-done revoke would leave the access token live with no retry.
      await expectGrantLive(grant);
    });

    it('code replay revokes nothing by halves when the audit row cannot be written', async () => {
      const grant = await seedGrant();
      const useCase = new ExchangeMcpOAuthAuthorizationCodeUseCase({
        mcpOAuthClientRepository: clients,
        mcpOAuthAuthorizationCodeRepository: codes,
        mcpOAuthTokenRepository: accessTokens,
        mcpOAuthRefreshTokenRepository: refreshTokens,
        securityEventRepository: failing(securityEvents, 'create'),
        generateId: nanoid,
        now,
        transactionManager: tm,
      } as never);

      await expect(
        useCase.execute({
          code: grant.code,
          codeVerifier: 'v'.repeat(43),
          clientId: grant.clientId,
          redirectUri: 'https://client.example/cb',
        }),
      ).rejects.toThrow('simulated failure');

      await expectGrantLive(grant);
    });
  });

  describe('TOTP backup codes', () => {
    it('lets only one of two concurrent attempts use a code', async () => {
      const userId = await makeUser();
      await backupCodes.create({ id: nanoid(), userId, codeHash: sha256('backup-code') });
      const deps = {
        totpProvider: { decryptSecret: () => 'secret', verifyCode: async () => false },
        totpBackupCodeRepository: backupCodes,
      };
      const attempt = () =>
        verifyTotpOrBackupCode(deps as never, { id: userId, totpSecret: 'x' }, 'backup-code');

      const results = await Promise.all([attempt(), attempt()]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
});
