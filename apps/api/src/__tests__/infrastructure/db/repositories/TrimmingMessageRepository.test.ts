import { describe, it, expect, vi } from 'vitest';
import { TrimmingMessageRepository } from '#src/infrastructure/db/repositories/TrimmingMessageRepository.js';
import { makeMessageRepository } from '#src/__tests__/helpers/mocks/chat.js';

const data = {
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user' as const,
  content: 'hello',
};

describe('TrimmingMessageRepository', () => {
  it('stores the message, then trims the conversation to the configured size', async () => {
    const calls: string[] = [];
    const inner = makeMessageRepository({
      create: vi.fn().mockImplementation(async (d) => {
        calls.push('create');
        return { ...d, toolTrace: null, createdAt: new Date() };
      }),
      trimToLatest: vi.fn().mockImplementation(async () => {
        calls.push('trim');
      }),
    });
    const repo = new TrimmingMessageRepository({ inner, keepLatest: 500 });

    const created = await repo.create(data);

    expect(created.id).toBe('msg-1');
    expect(calls).toEqual(['create', 'trim']);
    expect(inner.trimToLatest).toHaveBeenCalledWith('conv-1', 500);
  });

  it('does not trim when storing the message failed', async () => {
    const inner = makeMessageRepository({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const repo = new TrimmingMessageRepository({ inner, keepLatest: 500 });

    await expect(repo.create(data)).rejects.toThrow('db down');

    expect(inner.trimToLatest).not.toHaveBeenCalled();
  });

  it('reads through to the inner repository', async () => {
    const inner = makeMessageRepository();
    const repo = new TrimmingMessageRepository({ inner, keepLatest: 500 });

    await repo.findAllByConversationId('conv-1');

    expect(inner.findAllByConversationId).toHaveBeenCalledWith('conv-1');
  });
});
