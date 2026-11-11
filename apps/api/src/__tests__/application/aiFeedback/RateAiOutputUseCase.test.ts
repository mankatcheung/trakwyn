import { describe, it, expect, vi } from 'vitest';
import { RateAiOutputUseCase } from '#src/use-cases/aiFeedback/RateAiOutputUseCase.js';
import {
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  makeAiFeedbackObserver,
  makeAiFeedbackRepository,
  makeAiGeneration,
} from '#src/__tests__/helpers/mocks/aiFeedback.js';
import {
  makeConversation,
  makeConversationRepository,
  makeMessage,
  makeMessageRepository,
} from '#src/__tests__/helpers/mocks/chat.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';

const generation = makeAiGeneration({ model: 'answering-model', promptVersion: 7 });

function setup(
  overrides: {
    message?: ReturnType<typeof makeMessage> | null;
    conversationUserId?: string;
    draft?: ReturnType<typeof makeDocumentDraft> | null;
    appUserId?: string;
    allowed?: boolean;
  } = {},
) {
  const aiFeedbackRepository = makeAiFeedbackRepository();
  const aiFeedbackObserver = makeAiFeedbackObserver();
  const message =
    overrides.message === undefined
      ? makeMessage({ id: 'msg-1', role: 'assistant', generation })
      : overrides.message;
  const draft =
    overrides.draft === undefined
      ? makeDocumentDraft({ id: 'draft-1', type: 'resume', generation })
      : overrides.draft;
  const useCase = new RateAiOutputUseCase({
    aiFeedbackRepository,
    aiFeedbackObserver,
    aiFeedbackRateLimiter: makeRateLimiter({
      consume: vi.fn().mockResolvedValue(overrides.allowed ?? true),
    }),
    messageRepository: makeMessageRepository({ findById: vi.fn().mockResolvedValue(message) }),
    conversationRepository: makeConversationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          makeConversation({ id: 'conv-1', userId: overrides.conversationUserId ?? 'user-1' }),
        ),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(draft),
    }),
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          makeApplication({ id: 'app-1', userId: overrides.appUserId ?? 'user-1' }),
        ),
    }),
    generateId: () => 'fb-new',
  });
  return { useCase, aiFeedbackRepository, aiFeedbackObserver };
}

const rateMessage = (useCase: RateAiOutputUseCase, extra = {}) =>
  useCase.execute({
    userId: 'user-1',
    targetKind: 'chat_message',
    targetId: 'msg-1',
    rating: 'up',
    ...extra,
  });

describe('RateAiOutputUseCase', () => {
  it('stores the rating with the generation of the message and none of its text', async () => {
    const { useCase, aiFeedbackRepository } = setup();

    await rateMessage(useCase, { rating: 'down', reason: 'not_useful' });

    expect(aiFeedbackRepository.upsert).toHaveBeenCalledWith({
      id: 'fb-new',
      userId: 'user-1',
      targetKind: 'chat_message',
      targetId: 'msg-1',
      feature: 'chat',
      rating: 'down',
      reason: 'not_useful',
      generation,
    });
    expect(JSON.stringify(vi.mocked(aiFeedbackRepository.upsert).mock.calls)).not.toContain('hi');
  });

  it('tells the observer, with the model that answered', async () => {
    const { useCase, aiFeedbackObserver } = setup();

    await rateMessage(useCase, { rating: 'down', reason: 'wrong_or_made_up' });

    expect(aiFeedbackObserver.rated).toHaveBeenCalledWith({
      feature: 'chat',
      rating: 'down',
      reason: 'wrong_or_made_up',
      generation,
    });
  });

  it('still records a rating on a reply from before the snapshot, without a generation', async () => {
    const { useCase, aiFeedbackRepository } = setup({
      message: makeMessage({ id: 'msg-1', role: 'assistant', generation: null }),
    });

    await rateMessage(useCase);

    expect(aiFeedbackRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ generation: null }),
    );
  });

  it("reads another user's message as not found", async () => {
    const { useCase, aiFeedbackRepository } = setup({ conversationUserId: 'someone-else' });

    await expect(rateMessage(useCase)).rejects.toBeInstanceOf(NotFoundError);
    expect(aiFeedbackRepository.upsert).not.toHaveBeenCalled();
  });

  it('reads a missing message as not found', async () => {
    const { useCase } = setup({ message: null });

    await expect(rateMessage(useCase)).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['user', 'system'] as const)('rejects a rating on a %s message', async (role) => {
    const { useCase, aiFeedbackRepository } = setup({
      message: makeMessage({ id: 'msg-1', role }),
    });

    await expect(rateMessage(useCase)).rejects.toBeInstanceOf(ValidationError);
    expect(aiFeedbackRepository.upsert).not.toHaveBeenCalled();
  });

  it('rates a resume draft under the resume feature', async () => {
    const { useCase, aiFeedbackRepository } = setup();

    await useCase.execute({
      userId: 'user-1',
      targetKind: 'document_draft',
      targetId: 'draft-1',
      rating: 'up',
    });

    expect(aiFeedbackRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'resume', targetKind: 'document_draft', generation }),
    );
  });

  it('rates a cover letter draft under the coverLetter feature', async () => {
    const { useCase, aiFeedbackRepository } = setup({
      draft: makeDocumentDraft({ id: 'draft-1', type: 'cover_letter', generation }),
    });

    await useCase.execute({
      userId: 'user-1',
      targetKind: 'document_draft',
      targetId: 'draft-1',
      rating: 'up',
    });

    expect(aiFeedbackRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'coverLetter' }),
    );
  });

  it("reads another user's draft as not found", async () => {
    const { useCase } = setup({ appUserId: 'someone-else' });

    await expect(
      useCase.execute({
        userId: 'user-1',
        targetKind: 'document_draft',
        targetId: 'draft-1',
        rating: 'up',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a draft the user wrote themselves', async () => {
    const { useCase } = setup({ draft: makeDocumentDraft({ id: 'draft-1', generation: null }) });

    await expect(
      useCase.execute({
        userId: 'user-1',
        targetKind: 'document_draft',
        targetId: 'draft-1',
        rating: 'up',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a reason on a thumbs up', async () => {
    const { useCase } = setup();

    await expect(rateMessage(useCase, { reason: 'not_useful' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects a reason outside the fixed list', async () => {
    const { useCase } = setup();

    await expect(
      rateMessage(useCase, { rating: 'down', reason: 'my own free text' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('is limited per user', async () => {
    const { useCase, aiFeedbackRepository } = setup({ allowed: false });

    await expect(rateMessage(useCase)).rejects.toBeInstanceOf(RateLimitedError);
    expect(aiFeedbackRepository.upsert).not.toHaveBeenCalled();
  });
});
