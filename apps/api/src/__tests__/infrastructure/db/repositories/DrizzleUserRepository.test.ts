import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user } from '#src/infrastructure/db/schema.js';

describe('DrizzleUserRepository', () => {
  let db: TestDb;
  let repo: DrizzleUserRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleUserRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(user);
  });

  describe('create', () => {
    it('persists a user and returns the entity', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });

      expect(u.id).toBe('u1');
      expect(u.email).toBe('a@b.com');
      expect(u.passwordHash).toBe('hashed');
      expect(u.createdAt).toBeInstanceOf(Date);
      expect(u.updatedAt).toBeInstanceOf(Date);
    });

    it('defaults totpSecret to null and totpEnabled to false', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      expect(u.totpSecret).toBeNull();
      expect(u.totpEnabled).toBe(false);
    });

    it('defaults notification preferences to enabled', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });

      expect(u.weeklyDigestEnabled).toBe(true);
      expect(u.followUpRemindersEnabled).toBe(true);
    });

    it('puts a new user on the Free plan with no expiry or source', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });

      expect(u.plan).toBe('free');
      expect(u.planExpiresAt).toBeNull();
      expect(u.planSource).toBeNull();
    });

    it('stores a Pro plan with its source and expiry, and reads it back', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const expiresAt = new Date('2026-12-01T00:00:00.000Z');

      const updated = await repo.update('u1', {
        plan: 'pro',
        planSource: 'trial',
        planExpiresAt: expiresAt,
      });
      const reloaded = await repo.findById('u1');

      expect(updated.plan).toBe('pro');
      expect(reloaded?.plan).toBe('pro');
      expect(reloaded?.planSource).toBe('trial');
      expect(reloaded?.planExpiresAt).toEqual(expiresAt);
    });

    it('defaults emailVerifiedAt to null', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      expect(u.emailVerifiedAt).toBeNull();
    });

    it('defaults profile fields to null', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });

      expect(u.name).toBeNull();
      expect(u.timezone).toBeNull();
      expect(u.targetRole).toBeNull();
    });

    it('creates a passwordless, pre-verified user for OAuth sign-up', async () => {
      const verifiedAt = new Date();
      const u = await repo.create({
        id: 'u1',
        email: 'oauth-user@example.com',
        passwordHash: null,
        name: 'Jeff Man',
        emailVerifiedAt: verifiedAt,
      });

      expect(u.passwordHash).toBeNull();
      expect(u.name).toBe('Jeff Man');
      expect(u.emailVerifiedAt).toEqual(verifiedAt);
    });

    it('defaults avatarKey to null', async () => {
      const u = await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      expect(u.avatarKey).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the user when it exists', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const found = await repo.findById('u1');

      expect(found?.id).toBe('u1');
      expect(found?.email).toBe('a@b.com');
    });

    it('returns null when the user does not exist', async () => {
      const found = await repo.findById('missing');
      expect(found).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('returns the user when the email matches', async () => {
      await repo.create({ id: 'u1', email: 'test@example.com', passwordHash: 'hashed' });
      const found = await repo.findByEmail('test@example.com');

      expect(found?.id).toBe('u1');
    });

    it('returns null for an unrecognised email', async () => {
      const found = await repo.findByEmail('nope@example.com');
      expect(found).toBeNull();
    });

    it('is case-sensitive', async () => {
      await repo.create({ id: 'u1', email: 'test@example.com', passwordHash: 'hashed' });
      const found = await repo.findByEmail('TEST@EXAMPLE.COM');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('updates email and returns the updated entity', async () => {
      await repo.create({ id: 'u1', email: 'old@example.com', passwordHash: 'hashed' });
      const updated = await repo.update('u1', { email: 'new@example.com' });

      expect(updated.email).toBe('new@example.com');
      expect(updated.passwordHash).toBe('hashed');
      expect(updated.id).toBe('u1');
    });

    it('updates passwordHash only', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'old-hash' });
      const updated = await repo.update('u1', { passwordHash: 'new-hash' });

      expect(updated.passwordHash).toBe('new-hash');
      expect(updated.email).toBe('a@b.com');
    });

    it('updates both email and passwordHash at once', async () => {
      await repo.create({ id: 'u1', email: 'old@example.com', passwordHash: 'old-hash' });
      const updated = await repo.update('u1', {
        email: 'new@example.com',
        passwordHash: 'new-hash',
      });

      expect(updated.email).toBe('new@example.com');
      expect(updated.passwordHash).toBe('new-hash');
    });

    it('returns an entity with Date fields', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const updated = await repo.update('u1', { email: 'b@c.com' });

      expect(updated.createdAt).toBeInstanceOf(Date);
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('sets totpSecret and totpEnabled', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const updated = await repo.update('u1', { totpSecret: 'ABCD1234', totpEnabled: true });

      expect(updated.totpSecret).toBe('ABCD1234');
      expect(updated.totpEnabled).toBe(true);
    });

    it('clears totpSecret when given null', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      await repo.update('u1', { totpSecret: 'ABCD1234', totpEnabled: true });
      const updated = await repo.update('u1', { totpSecret: null, totpEnabled: false });

      expect(updated.totpSecret).toBeNull();
      expect(updated.totpEnabled).toBe(false);
    });

    it('updates notification preferences', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const updated = await repo.update('u1', {
        weeklyDigestEnabled: false,
        followUpRemindersEnabled: false,
      });

      expect(updated.weeklyDigestEnabled).toBe(false);
      expect(updated.followUpRemindersEnabled).toBe(false);
    });

    it('sets emailVerifiedAt', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const verifiedAt = new Date();
      const updated = await repo.update('u1', { emailVerifiedAt: verifiedAt });

      expect(updated.emailVerifiedAt).toEqual(verifiedAt);
    });

    it('clears emailVerifiedAt when given null', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      await repo.update('u1', { emailVerifiedAt: new Date() });
      const updated = await repo.update('u1', { emailVerifiedAt: null });

      expect(updated.emailVerifiedAt).toBeNull();
    });

    it('updates name, timezone, and targetRole', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const updated = await repo.update('u1', {
        name: 'Jeff Man',
        timezone: 'America/Los_Angeles',
        targetRole: 'Staff Engineer',
      });

      expect(updated.name).toBe('Jeff Man');
      expect(updated.timezone).toBe('America/Los_Angeles');
      expect(updated.targetRole).toBe('Staff Engineer');
    });

    it('clears a profile field when given null', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      await repo.update('u1', { name: 'Jeff Man' });
      const updated = await repo.update('u1', { name: null });

      expect(updated.name).toBeNull();
    });

    it('sets and clears avatarKey', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const withAvatar = await repo.update('u1', { avatarKey: 'users/u1/avatar/key.png' });
      expect(withAvatar.avatarKey).toBe('users/u1/avatar/key.png');

      const cleared = await repo.update('u1', { avatarKey: null });
      expect(cleared.avatarKey).toBeNull();
    });

    it('sets and clears defaultLlmProvider', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      const withDefault = await repo.update('u1', { defaultLlmProvider: 'openai' });
      expect(withDefault.defaultLlmProvider).toBe('openai');

      const cleared = await repo.update('u1', { defaultLlmProvider: null });
      expect(cleared.defaultLlmProvider).toBeNull();
    });
  });

  describe('findScheduledForDeletionBefore', () => {
    it('returns accounts whose date has come, oldest first, and no others', async () => {
      const cutoff = new Date('2026-11-15T00:00:00.000Z');
      await repo.create({ id: 'due-late', email: 'a@b.com' });
      await repo.create({ id: 'due-early', email: 'c@d.com' });
      await repo.create({ id: 'later', email: 'e@f.com' });
      await repo.create({ id: 'never', email: 'g@h.com' });
      await repo.update('due-late', { deletionScheduledAt: cutoff });
      await repo.update('due-early', { deletionScheduledAt: new Date('2026-11-01T00:00:00.000Z') });
      await repo.update('later', { deletionScheduledAt: new Date('2026-11-16T00:00:00.000Z') });

      const due = await repo.findScheduledForDeletionBefore(cutoff);

      expect(due.map((u) => u.id)).toEqual(['due-early', 'due-late']);
      expect(due[0]?.deletionScheduledAt).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    });

    it('stops returning an account once its deletion is cancelled', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com' });
      await repo.update('u1', { deletionScheduledAt: new Date('2026-11-01T00:00:00.000Z') });
      await repo.update('u1', { deletionScheduledAt: null });

      expect(await repo.findScheduledForDeletionBefore(new Date('2027-01-01'))).toEqual([]);
    });
  });

  describe('delete', () => {
    it('removes the user from the database', async () => {
      await repo.create({ id: 'u1', email: 'a@b.com', passwordHash: 'hashed' });
      await repo.delete('u1');

      const found = await repo.findById('u1');
      expect(found).toBeNull();
    });
  });
});
