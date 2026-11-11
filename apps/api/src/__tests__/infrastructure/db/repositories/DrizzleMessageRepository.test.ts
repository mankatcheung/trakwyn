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

  describe('trimToLatest (JEF-339)', () => {
    const insertMessages = async (conversationId: string, count: number) => {
      for (let i = 1; i <= count; i++) {
        await db.db.insert(message).values({
          id: `${conversationId}-m${i}`,
          conversationId,
          role: 'user',
          content: `message ${i}`,
          createdAt: new Date(Date.UTC(2024, 0, i)),
        });
      }
    };

    it('keeps only the newest messages, oldest first', async () => {
      await insertMessages('conv-1', 5);

      await repo.trimToLatest('conv-1', 3);

      const kept = await repo.findAllByConversationId('conv-1');
      expect(kept.map((m) => m.id)).toEqual(['conv-1-m3', 'conv-1-m4', 'conv-1-m5']);
    });

    it('removes nothing when the conversation is at or under the limit', async () => {
      await insertMessages('conv-1', 3);

      await repo.trimToLatest('conv-1', 3);

      expect(await repo.findAllByConversationId('conv-1')).toHaveLength(3);
    });

    it('breaks a tie on the timestamp by id, keeping the larger ids', async () => {
      const sameInstant = new Date('2024-02-01T00:00:00Z');
      for (const id of ['a', 'b', 'c']) {
        await db.db.insert(message).values({
          id,
          conversationId: 'conv-1',
          role: 'user',
          content: id,
          createdAt: sameInstant,
        });
      }

      await repo.trimToLatest('conv-1', 2);

      const kept = await repo.findAllByConversationId('conv-1');
      expect(kept.map((m) => m.id).sort()).toEqual(['b', 'c']);
    });

    it('leaves another conversation alone', async () => {
      await insertMessages('conv-1', 4);
      await insertMessages('conv-2', 4);

      await repo.trimToLatest('conv-1', 1);

      expect(await repo.findAllByConversationId('conv-1')).toHaveLength(1);
      expect(await repo.findAllByConversationId('conv-2')).toHaveLength(4);
    });
  });

  describe('generation (JEF-547)', () => {
    const generation = {
      provider: 'openai',
      model: 'gpt-test',
      promptVersion: 4,
      source: 'platform',
      tier: 'lite',
    };

    it('stores which model and prompt wrote a reply and reads it back', async () => {
      const created = await repo.create({
        id: 'msg-gen',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'hello',
        generation,
      });

      expect(created.generation).toEqual(generation);
      expect((await repo.findById('msg-gen'))?.generation).toEqual(generation);
    });

    it('reads null for a message with no snapshot', async () => {
      const created = await repo.create({
        id: 'msg-old',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'hello',
      });

      expect(created.generation).toBeNull();
    });

    it('findById answers null for an unknown id', async () => {
      expect(await repo.findById('nope')).toBeNull();
    });
  });
});
