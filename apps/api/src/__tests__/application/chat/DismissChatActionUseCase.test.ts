import { describe, it, expect, vi } from 'vitest';
import { DismissChatActionUseCase } from '#src/use-cases/chat/DismissChatActionUseCase.js';
import {
  makeChatActionProposal,
  makeChatActionProposalRepository,
  makeMessageRepository,
} from '#src/__tests__/helpers/mocks/chat.js';

function setup(overrides?: {
  found?: ReturnType<typeof makeChatActionProposal> | null;
  dismissed?: ReturnType<typeof makeChatActionProposal> | null;
}) {
  const pending = makeChatActionProposal();
  const chatActionProposalRepository = makeChatActionProposalRepository({
    findByIdForUser: vi
      .fn()
      .mockResolvedValue(overrides && 'found' in overrides ? overrides.found : pending),
    resolvePending: vi
      .fn()
      .mockResolvedValue(
        overrides && 'dismissed' in overrides
          ? overrides.dismissed
          : { ...pending, status: 'dismissed' },
      ),
  });
  const messageRepository = makeMessageRepository();
  const useCase = new DismissChatActionUseCase({
    chatActionProposalRepository,
    messageRepository,
    generateId: () => 'note-1',
  });
  return { useCase, chatActionProposalRepository, messageRepository };
}

const dismiss = (useCase: DismissChatActionUseCase) =>
  useCase.execute({ userId: 'user-1', proposalId: 'prop-1' });

describe('DismissChatActionUseCase', () => {
  it('dismisses a pending proposal and tells the model', async () => {
    const { useCase, chatActionProposalRepository, messageRepository } = setup();

    const { proposal } = await dismiss(useCase);

    expect(proposal.status).toBe('dismissed');
    expect(chatActionProposalRepository.resolvePending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      'dismissed',
      expect.any(Date),
    );
    expect(messageRepository.create).toHaveBeenCalledWith({
      id: 'note-1',
      conversationId: 'conv-1',
      role: 'system',
      content: 'User dismissed: Move Acme / Engineer to interviewing',
    });
  });

  it("refuses another user's proposal as not found", async () => {
    const { useCase, messageRepository } = setup({ found: null });

    const err = await dismiss(useCase).catch((e) => e);

    expect(err.code).toBe('NOT_FOUND');
    expect(messageRepository.create).not.toHaveBeenCalled();
  });

  it('cannot undo a proposal that was already confirmed or handled', async () => {
    const { useCase, messageRepository } = setup({ dismissed: null });

    const err = await dismiss(useCase).catch((e) => e);

    expect(err.code).toBe('CONFLICT');
    expect(messageRepository.create).not.toHaveBeenCalled();
  });
});
