import { describe, it, expect, vi } from 'vitest';
import { ConfirmChatActionUseCase } from '#src/use-cases/chat/ConfirmChatActionUseCase.js';
import { PlanRequiredError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import {
  makeChatActionProposal,
  makeChatActionProposalRepository,
  makeChatWriteTools,
  makeMessageRepository,
} from '#src/__tests__/helpers/mocks/chat.js';

function setup(overrides?: {
  found?: ReturnType<typeof makeChatActionProposal> | null;
  claimed?: ReturnType<typeof makeChatActionProposal> | null;
}) {
  const pending = makeChatActionProposal();
  const found = overrides && 'found' in overrides ? overrides.found : pending;
  const claimed =
    overrides && 'claimed' in overrides
      ? overrides.claimed
      : { ...pending, status: 'confirmed' as const };
  const chatActionProposalRepository = makeChatActionProposalRepository({
    findByIdForUser: vi.fn().mockResolvedValue(found),
    claimPending: vi.fn().mockResolvedValue(claimed),
    resolvePending: vi.fn().mockResolvedValue(null),
  });
  const chatWriteTools = makeChatWriteTools();
  const messageRepository = makeMessageRepository();
  const transactionManager = { run: vi.fn().mockImplementation((fn) => fn()) };
  const useCase = new ConfirmChatActionUseCase({
    chatActionProposalRepository,
    chatWriteTools,
    messageRepository,
    transactionManager,
    generateId: () => 'note-1',
  });
  return {
    useCase,
    chatActionProposalRepository,
    chatWriteTools,
    messageRepository,
    transactionManager,
  };
}

const confirm = (useCase: ConfirmChatActionUseCase) =>
  useCase.execute({ userId: 'user-1', proposalId: 'prop-1' });

describe('ConfirmChatActionUseCase', () => {
  it('claims the proposal and applies exactly the saved tool and arguments', async () => {
    const { useCase, chatWriteTools, chatActionProposalRepository, transactionManager } = setup();

    const { proposal } = await confirm(useCase);

    expect(transactionManager.run).toHaveBeenCalledTimes(1);
    expect(chatActionProposalRepository.claimPending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      expect.any(Date),
    );
    expect(chatWriteTools.apply).toHaveBeenCalledWith(
      'update_application',
      { applicationId: 'app-1', status: 'interviewing' },
      'user-1',
    );
    expect(proposal.status).toBe('confirmed');
  });

  it('leaves a note for the model on the next turn', async () => {
    const { useCase, messageRepository } = setup();

    await confirm(useCase);

    expect(messageRepository.create).toHaveBeenCalledWith({
      id: 'note-1',
      conversationId: 'conv-1',
      role: 'system',
      content: 'User confirmed: Move Acme / Engineer to interviewing',
    });
  });

  it("refuses another user's proposal as not found, applying nothing", async () => {
    const { useCase, chatWriteTools } = setup({ found: null });

    const err = await confirm(useCase).catch((e) => e);

    expect(err.code).toBe('NOT_FOUND');
    expect(chatWriteTools.apply).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'dismissed', 'expired', 'failed'] as const)(
    'refuses a %s proposal',
    async (status) => {
      const { useCase, chatWriteTools } = setup({ found: makeChatActionProposal({ status }) });

      const err = await confirm(useCase).catch((e) => e);

      expect(err.code).toBe('CONFLICT');
      expect(chatWriteTools.apply).not.toHaveBeenCalled();
    },
  );

  it('refuses an expired pending proposal and marks it expired', async () => {
    const { useCase, chatWriteTools, chatActionProposalRepository } = setup({
      found: makeChatActionProposal({ expiresAt: new Date(Date.now() - 1000) }),
    });

    const err = await confirm(useCase).catch((e) => e);

    expect(err.code).toBe('CONFLICT');
    expect(chatActionProposalRepository.resolvePending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      'expired',
      expect.any(Date),
    );
    expect(chatWriteTools.apply).not.toHaveBeenCalled();
  });

  it('applies once when two confirms race: the loser fails the claim', async () => {
    const { useCase, chatWriteTools } = setup({ claimed: null });

    const err = await confirm(useCase).catch((e) => e);

    expect(err.code).toBe('CONFLICT');
    expect(chatWriteTools.apply).not.toHaveBeenCalled();
  });

  it('marks the proposal failed with the error and rethrows it, e.g. PLAN_REQUIRED', async () => {
    const { useCase, chatWriteTools, chatActionProposalRepository, messageRepository } = setup();
    vi.mocked(chatWriteTools.apply).mockRejectedValue(new PlanRequiredError('Offers need Pro'));

    const err = await confirm(useCase).catch((e) => e);

    expect(err.code).toBe('PLAN_REQUIRED');
    expect(chatActionProposalRepository.resolvePending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      'failed',
      expect.any(Date),
      'Offers need Pro',
    );
    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'system', content: expect.stringContaining('it failed') }),
    );
  });

  it('keeps the message of an internal failure off the card', async () => {
    const { useCase, chatWriteTools, chatActionProposalRepository } = setup();
    vi.mocked(chatWriteTools.apply).mockRejectedValue(new Error('relation "offer" does not exist'));

    await confirm(useCase).catch(() => undefined);

    expect(chatActionProposalRepository.resolvePending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      'failed',
      expect.any(Date),
      'The change could not be applied',
    );
  });

  it('marks a tool that rejects its saved arguments as failed', async () => {
    const { useCase, chatWriteTools, chatActionProposalRepository } = setup();
    vi.mocked(chatWriteTools.apply).mockRejectedValue(new ValidationError('company is required'));

    await confirm(useCase).catch(() => undefined);

    expect(chatActionProposalRepository.resolvePending).toHaveBeenCalledWith(
      'prop-1',
      'user-1',
      'failed',
      expect.any(Date),
      'company is required',
    );
  });
});
