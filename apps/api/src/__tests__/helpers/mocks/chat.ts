/**
 * Test doubles for the chat domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { Conversation } from '#src/domain/conversation/Conversation.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IMessageRepository } from '#src/use-cases/ports/IMessageRepository.js';
import type { Message } from '#src/domain/message/Message.js';

export const makeMessageRepository = (
  overrides?: Partial<IMessageRepository>,
): IMessageRepository => ({
  create: vi.fn(),
  findAllByConversationId: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeMessage = (overrides?: Partial<Message>): Message => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user',
  content: 'hi',
  toolTrace: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeConversationRepository = (
  overrides?: Partial<IConversationRepository>,
): IConversationRepository => ({
  create: vi.fn(),
  findById: vi.fn().mockResolvedValue(null),
  findAllByUserId: vi.fn().mockResolvedValue([]),
  searchByUserId: vi.fn().mockResolvedValue([]),
  updateTitle: vi.fn(),
  updateLlmSettings: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-1',
  userId: 'user-1',
  title: null,
  llmProvider: null,
  llmModel: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// Domain object fixtures
