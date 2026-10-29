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
import type { ChatActionProposal } from '#src/domain/chatActionProposal/ChatActionProposal.js';
import type { IChatActionProposalRepository } from '#src/use-cases/ports/IChatActionProposalRepository.js';
import type { IChatWriteTools } from '#src/use-cases/ports/IChatWriteTools.js';

export const makeMessageRepository = (
  overrides?: Partial<IMessageRepository>,
): IMessageRepository => ({
  create: vi.fn().mockImplementation(async (data) => makeMessage(data)),
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

export const makeChatActionProposalRepository = (
  overrides?: Partial<IChatActionProposalRepository>,
): IChatActionProposalRepository => ({
  create: vi
    .fn()
    .mockImplementation(async (data) => makeChatActionProposal({ ...data, status: 'pending' })),
  findByIdForUser: vi.fn().mockResolvedValue(null),
  findAllByConversationId: vi.fn().mockResolvedValue([]),
  attachToMessage: vi.fn(),
  claimPending: vi.fn().mockResolvedValue(null),
  resolvePending: vi.fn().mockResolvedValue(null),
  ...overrides,
});

export const makeChatWriteTools = (overrides?: Partial<IChatWriteTools>): IChatWriteTools => ({
  has: vi.fn().mockReturnValue(false),
  prepare: vi.fn().mockResolvedValue({ args: {}, summary: 'Do a thing' }),
  apply: vi.fn().mockResolvedValue({ id: 'new-1' }),
  ...overrides,
});

export const makeChatActionProposal = (
  overrides?: Partial<ChatActionProposal>,
): ChatActionProposal => ({
  id: 'prop-1',
  userId: 'user-1',
  conversationId: 'conv-1',
  messageId: null,
  toolName: 'update_application',
  args: { applicationId: 'app-1', status: 'interviewing' },
  summary: 'Move Acme / Engineer to interviewing',
  status: 'pending',
  error: null,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  resolvedAt: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

// Domain object fixtures
