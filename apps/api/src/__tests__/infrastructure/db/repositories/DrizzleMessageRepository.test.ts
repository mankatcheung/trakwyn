import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleMessageRepository } from '#src/infrastructure/db/repositories/DrizzleMessageRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, conversation, message } from '#src/infrastructure/db/schema.js';

describe('DrizzleMessageRepository', () => {
  let db: TestDb;
  let repo: DrizzleMessageRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleMessageRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(conversation).values({ id: 'conv-1', userId: 'u1' });
    await db.db.insert(conversation).values({ id: 'conv-2', userId: 'u1' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(message);
  });

  describe('create', () => {
    it('persists a message and returns the entity', async () => {
      const msg = await repo.create({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'hi there',
      });

      expect(msg.id).toBe('msg-1');
      expect(msg.conversationId).toBe('conv-1');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('hi there');
      expect(msg.createdAt).toBeInstanceOf(Date);
    });

    it("stores an assistant reply's tool trace and reads it back; null when absent (F10)", async () => {
      const plain = await repo.create({
        id: 'msg-plain',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'hello',
      });
      const traced = await repo.create({
        id: 'msg-traced',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'two apps',
        toolTrace: 'list_applications → 2 results: a Acme/Eng, b Globex/Staff',
      });

      expect(plain.toolTrace).toBeNull();
      expect(traced.toolTrace).toBe('list_applications → 2 results: a Acme/Eng, b Globex/Staff');
      const [, second] = await repo.findAllByConversationId('conv-1');
      expect(second.toolTrace).toBe(traced.toolTrace);
    });
  });

  describe('findAllByConversationId', () => {
    it('returns messages for the conversation ordered oldest first', async () => {
      await db.db.insert(message).values({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'first',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });
      await db.db.insert(message).values({
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'second',
        createdAt: new Date('2024-01-02T00:00:00Z'),
      });

      const messages = await repo.findAllByConversationId('conv-1');
      expect(messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    });

    it('does not return another conversation’s messages', async () => {
      await db.db
        .insert(message)
        .values({ id: 'msg-1', conversationId: 'conv-2', role: 'user', content: 'not mine' });

      expect(await repo.findAllByConversationId('conv-1')).toHaveLength(0);
    });

    it('returns an empty array when the conversation has no messages', async () => {
      expect(await repo.findAllByConversationId('conv-1')).toHaveLength(0);
    });
  });
});
