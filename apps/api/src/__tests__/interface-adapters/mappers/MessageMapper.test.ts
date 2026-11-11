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
    generation: null,
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

  it('carries the caller’s own rating, and null when there is none (JEF-547)', () => {
    expect(mapper.toDTO(msg).myRating).toBeNull();
    expect(mapper.toDTO(msg, [], { rating: 'down', reason: 'not_useful' }).myRating).toEqual({
      rating: 'down',
      reason: 'not_useful',
    });
  });

  it('does not leak the generation snapshot onto the DTO (JEF-547)', () => {
    const dto = mapper.toDTO({
      ...msg,
      generation: { provider: 'openai', model: 'm', promptVersion: 1, source: 'byok', tier: null },
    }) as Record<string, unknown>;

    expect(dto.generation).toBeUndefined();
  });
});
