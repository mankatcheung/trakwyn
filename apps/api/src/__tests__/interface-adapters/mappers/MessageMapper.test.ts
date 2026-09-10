import { describe, it, expect } from 'vitest';
import { MessageMapper } from '#src/interface-adapters/mappers/MessageMapper.js';
import type { Message } from '#src/domain/message/Message.js';

describe('MessageMapper', () => {
  const mapper = new MessageMapper();

  const msg: Message = {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'assistant',
    content: 'You have 3 active applications.',
    toolTrace: null,
    createdAt: new Date('2024-03-01T08:00:00.000Z'),
  };

  it('converts createdAt to an ISO string', () => {
    const dto = mapper.toDTO(msg);
    expect(dto.createdAt).toBe('2024-03-01T08:00:00.000Z');
  });

  it('passes scalar fields through unchanged', () => {
    const dto = mapper.toDTO(msg);

    expect(dto.id).toBe('msg-1');
    expect(dto.role).toBe('assistant');
    expect(dto.content).toBe('You have 3 active applications.');
  });

  it('does not leak conversationId onto the DTO', () => {
    const dto = mapper.toDTO(msg) as Record<string, unknown>;
    expect(dto.conversationId).toBeUndefined();
  });
});
