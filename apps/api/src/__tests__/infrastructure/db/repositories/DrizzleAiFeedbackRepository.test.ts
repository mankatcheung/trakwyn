import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleAiFeedbackRepository } from '#src/infrastructure/db/repositories/DrizzleAiFeedbackRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, aiFeedback } from '#src/infrastructure/db/schema.js';

const generation = {
  provider: 'openai',
  model: 'gpt-test',
  promptVersion: 5,
  source: 'platform',
  tier: 'lite',
  traceId: 'trace-1',
};

describe('DrizzleAiFeedbackRepository', () => {
  let db: TestDb;
  let repo: DrizzleAiFeedbackRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleAiFeedbackRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u1@t.com', passwordHash: 'h' });
    await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(aiFeedback);
  });

  const rate = (overrides: Partial<Parameters<typeof repo.upsert>[0]> = {}) =>
    repo.upsert({
      id: 'fb-1',
      userId: 'u1',
      targetKind: 'chat_message',
      targetId: 'msg-1',
      feature: 'chat',
      rating: 'up',
      reason: null,
      generation,
      ...overrides,
    });

  describe('upsert', () => {
    it('stores the rating with the generation and no text', async () => {
      const saved = await rate({ rating: 'down', reason: 'wrong_or_made_up' });

      expect(saved).toMatchObject({
        userId: 'u1',
        targetKind: 'chat_message',
        targetId: 'msg-1',
        feature: 'chat',
        rating: 'down',
        reason: 'wrong_or_made_up',
        generation,
      });
    });

    it('keeps one row per user per target: rating again replaces the earlier one', async () => {
      const first = await rate({ rating: 'up' });
      const second = await rate({
        id: 'fb-2',
        rating: 'down',
        reason: 'not_useful',
        generation: { ...generation, model: 'failover-model' },
      });

      expect(second.id).toBe(first.id);
      expect(second.rating).toBe('down');
      expect(second.reason).toBe('not_useful');
      expect(second.generation?.model).toBe('failover-model');
      expect(await db.db.select().from(aiFeedback)).toHaveLength(1);
    });

    it('drops the reason when a thumbs down becomes a thumbs up', async () => {
      await rate({ rating: 'down', reason: 'other' });

      const flipped = await rate({ rating: 'up', reason: null });

      expect(flipped.reason).toBeNull();
    });

    it("keeps each user's rating of the same target apart", async () => {
      await rate({ id: 'a', userId: 'u1' });
      await rate({ id: 'b', userId: 'u2', rating: 'down' });

      expect(await db.db.select().from(aiFeedback)).toHaveLength(2);
    });

    it('stores a rating on an output from before the snapshot, with no generation', async () => {
      const saved = await rate({ generation: null });

      expect(saved.generation).toBeNull();
    });
  });

  describe('clear', () => {
    it("removes the caller's rating and nobody else's", async () => {
      await rate({ id: 'a', userId: 'u1' });
      await rate({ id: 'b', userId: 'u2' });

      const removed = await repo.clear('u1', 'chat_message', 'msg-1');

      expect(removed).toMatchObject({ userId: 'u1', rating: 'up', generation });

      const rows = await db.db.select().from(aiFeedback);
      expect(rows.map((r) => r.userId)).toEqual(['u2']);
    });

    it('is a no-op when there is no rating', async () => {
      await expect(repo.clear('u1', 'chat_message', 'nope')).resolves.toBeNull();
    });
  });

  describe('findForTargets', () => {
    it("returns only the caller's ratings among the given ids, of the given kind", async () => {
      await rate({ id: 'a', targetId: 'msg-1' });
      await rate({ id: 'b', targetId: 'msg-2' });
      await rate({ id: 'c', targetId: 'msg-3' });
      await rate({ id: 'd', targetId: 'msg-1', userId: 'u2' });
      await rate({ id: 'e', targetId: 'msg-1', targetKind: 'document_draft' });

      const found = await repo.findForTargets('u1', 'chat_message', ['msg-1', 'msg-2', 'msg-9']);

      expect(found.map((f) => f.targetId).sort()).toEqual(['msg-1', 'msg-2']);
      expect(found.every((f) => f.userId === 'u1')).toBe(true);
    });

    it('answers an empty list without a query', async () => {
      expect(await repo.findForTargets('u1', 'chat_message', [])).toEqual([]);
    });
  });

  it('outlives its message but goes with the user', async () => {
    await rate({ targetId: 'message-that-no-longer-exists' });
    expect(
      await repo.findForTargets('u1', 'chat_message', ['message-that-no-longer-exists']),
    ).toHaveLength(1);

    await db.db.delete(user).where(eq(user.id, 'u1'));

    expect(await db.db.select().from(aiFeedback)).toHaveLength(0);
    await db.db.insert(user).values({ id: 'u1', email: 'u1@t.com', passwordHash: 'h' });
  });
});
