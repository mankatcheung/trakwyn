import { describe, it, expect, vi } from 'vitest';
import { GetChatHistoryUseCase } from '#src/use-cases/chat/GetChatHistoryUseCase.js';
import {
  makeChatActionProposal,
  makeChatActionProposalRepository,
  makeConversation,
  makeConversationRepository,
  makeMessage,
  makeMessageRepository,
} from '#src/__tests__/helpers/mocks/chat.js';

function makeUseCase(overrides?: {
  messages?: ReturnType<typeof makeMessage>[];
  proposals?: ReturnType<typeof makeChatActionProposal>[];
  conversationUserId?: string | null;
}) {
  const conversationUserId =
    overrides && 'conversationUserId' in overrides ? overrides.conversationUserId : 'user-1';
  return new GetChatHistoryUseCase({
    messageRepository: makeMessageRepository({
      findAllByConversationId: vi.fn().mockResolvedValue(overrides?.messages ?? []),
    }),
    conversationRepository: makeConversationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          conversationUserId
            ? makeConversation({ id: 'conv-1', userId: conversationUserId })
            : null,
        ),
    }),
    chatActionProposalRepository: makeChatActionProposalRepository({
      findAllByConversationId: vi.fn().mockResolvedValue(overrides?.proposals ?? []),
    }),
  });
}

const run = (useCase: GetChatHistoryUseCase) =>
  useCase.execute({ userId: 'user-1', conversationId: 'conv-1' });

describe('GetChatHistoryUseCase', () => {
  it('returns the messages for the conversation when it belongs to the user', async () => {
    const messages = [makeMessage({ id: 'msg-1' }), makeMessage({ id: 'msg-2' })];

    const result = await run(makeUseCase({ messages }));

    expect(result).toEqual(messages.map((m) => ({ ...m, proposals: [] })));
  });

  it('returns an empty array when the conversation has no messages', async () => {
    expect(await run(makeUseCase())).toEqual([]);
  });

  it('attaches each message its proposals at their current status (JEF-469)', async () => {
    const confirmed = makeChatActionProposal({ id: 'p1', messageId: 'msg-2', status: 'confirmed' });
    const other = makeChatActionProposal({ id: 'p2', messageId: 'msg-3' });

    const result = await run(
      makeUseCase({
        messages: [makeMessage({ id: 'msg-2', role: 'assistant' }), makeMessage({ id: 'msg-1' })],
        proposals: [confirmed, other],
      }),
    );

    expect(result[0].proposals).toEqual([confirmed]);
    expect(result[1].proposals).toEqual([]);
  });

  it('shows a pending proposal past its expiry as expired, so no dead Confirm button is offered', async () => {
    const stale = makeChatActionProposal({
      messageId: 'msg-1',
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    });

    const [message] = await run(
      makeUseCase({
        messages: [makeMessage({ id: 'msg-1', role: 'assistant' })],
        proposals: [stale],
      }),
    );

    expect(message.proposals[0].status).toBe('expired');
  });

  it('never returns the system notes written for the model', async () => {
    const result = await run(
      makeUseCase({
        messages: [
          makeMessage({ id: 'msg-1', role: 'assistant' }),
          makeMessage({ id: 'msg-2', role: 'system', content: 'User confirmed: x' }),
        ],
      }),
    );

    expect(result.map((m) => m.id)).toEqual(['msg-1']);
  });

  it('throws NOT_FOUND when the conversation does not exist', async () => {
    const err = await run(makeUseCase({ conversationUserId: null })).catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the conversation belongs to another user', async () => {
    const err = await run(makeUseCase({ conversationUserId: 'someone-else' })).catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });
});
