import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleChatActionProposalRepository } from '#src/infrastructure/db/repositories/DrizzleChatActionProposalRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, conversation, chatActionProposal } from '#src/infrastructure/db/schema.js';

describe('DrizzleChatActionProposalRepository', () => {
  let db: TestDb;
  let repo: DrizzleChatActionProposalRepository;

  const future = () => new Date(Date.now() + 60_000);
  const make = (id: string, overrides: { userId?: string; expiresAt?: Date } = {}) =>
    repo.create({
      id,
      userId: overrides.userId ?? 'u1',
      conversationId: 'conv-1',
      toolName: 'update_application',
      args: { applicationId: 'app-1', status: 'interviewing' },
      summary: 'Move Acme to interviewing',
      expiresAt: overrides.expiresAt ?? future(),
    });

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleChatActionProposalRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(user).values({ id: 'u2', email: 'v@t.com', passwordHash: 'h' });
    await db.db.insert(conversation).values({ id: 'conv-1', userId: 'u1' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(chatActionProposal);
  });

  it('stores the exact tool and arguments as a pending proposal', async () => {
    const created = await make('p1');

    expect(created).toMatchObject({
      id: 'p1',
      status: 'pending',
      messageId: null,
      error: null,
      resolvedAt: null,
      args: { applicationId: 'app-1', status: 'interviewing' },
    });
    expect(await repo.findByIdForUser('p1', 'u1')).toEqual(created);
  });

  it("does not find another user's proposal", async () => {
    await make('p1');

    expect(await repo.findByIdForUser('p1', 'u2')).toBeNull();
  });

  it('attaches proposals to a message and lists a conversation oldest first', async () => {
    await make('p1');
    await make('p2');
    await repo.attachToMessage(['p1', 'p2'], 'msg-1');
    await repo.attachToMessage([], 'ignored');

    const all = await repo.findAllByConversationId('conv-1');

    expect(all.map((p) => [p.id, p.messageId])).toEqual([
      ['p1', 'msg-1'],
      ['p2', 'msg-1'],
    ]);
  });

  describe('claimPending', () => {
    it('claims once: the second claim gets nothing', async () => {
      await make('p1');

      const first = await repo.claimPending('p1', 'u1', new Date());
      const second = await repo.claimPending('p1', 'u1', new Date());

      expect(first).toMatchObject({ status: 'confirmed', resolvedAt: expect.any(Date) });
      expect(second).toBeNull();
    });

    it('settles simultaneous claims on exactly one winner', async () => {
      await make('p1');

      const results = await Promise.all(
        Array.from({ length: 5 }, () => repo.claimPending('p1', 'u1', new Date())),
      );

      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it('refuses an expired proposal, another user, and a dismissed one', async () => {
      await make('expired', { expiresAt: new Date(Date.now() - 1000) });
      await make('foreign');
      await make('dismissed');
      await repo.resolvePending('dismissed', 'u1', 'dismissed', new Date());

      expect(await repo.claimPending('expired', 'u1', new Date())).toBeNull();
      expect(await repo.claimPending('foreign', 'u2', new Date())).toBeNull();
      expect(await repo.claimPending('dismissed', 'u1', new Date())).toBeNull();
    });
  });

  describe('resolvePending', () => {
    it('records the outcome and error on a pending proposal', async () => {
      await make('p1');

      const failed = await repo.resolvePending('p1', 'u1', 'failed', new Date(), 'Offers need Pro');

      expect(failed).toMatchObject({ status: 'failed', error: 'Offers need Pro' });
    });

    it('cannot overwrite a confirmed proposal', async () => {
      await make('p1');
      await repo.claimPending('p1', 'u1', new Date());

      expect(await repo.resolvePending('p1', 'u1', 'dismissed', new Date())).toBeNull();
      expect((await repo.findByIdForUser('p1', 'u1'))?.status).toBe('confirmed');
    });
  });

  it('is removed with its conversation', async () => {
    await make('p1');

    await db.db.delete(conversation);

    expect(await repo.findAllByConversationId('conv-1')).toEqual([]);
    await db.db.insert(conversation).values({ id: 'conv-1', userId: 'u1' });
  });
});
