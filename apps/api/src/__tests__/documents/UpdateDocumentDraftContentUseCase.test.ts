import { describe, it, expect, vi } from 'vitest';
import { UpdateDocumentDraftContentUseCase } from '#src/use-cases/documents/UpdateDocumentDraftContentUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('UpdateDocumentDraftContentUseCase', () => {
  it('throws NOT_FOUND when the draft does not exist', async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new UpdateDocumentDraftContentUseCase({
      documentDraftRepository,
      applicationRepository: makeApplicationRepository(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', draftId: 'draft-missing', contentJson: '{}', plainText: '' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to another user', async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other-user' })),
    });

    const useCase = new UpdateDocumentDraftContentUseCase({
      documentDraftRepository,
      applicationRepository,
    });
    const err = await useCase
      .execute({ userId: 'user-1', draftId: 'draft-1', contentJson: '{}', plainText: '' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('updates the draft content with the correct data', async () => {
    const draft = makeDocumentDraft();
    const updatedDraft = makeDocumentDraft({
      contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
      plainText: 'Hello world',
      updatedAt: new Date('2024-06-01'),
    });
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(draft),
      updateContent: vi.fn().mockResolvedValue(updatedDraft),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication()),
    });

    const useCase = new UpdateDocumentDraftContentUseCase({
      documentDraftRepository,
      applicationRepository,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      draftId: 'draft-1',
      contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
      plainText: 'Hello world',
    });

    expect(result).toEqual(updatedDraft);
    expect(documentDraftRepository.updateContent).toHaveBeenCalledWith('draft-1', {
      contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
      plainText: 'Hello world',
    });
  });

  describe('aiInstructions (JEF-506)', () => {
    const setup = () => {
      const documentDraftRepository = makeDocumentDraftRepository({
        findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
        updateContent: vi.fn().mockResolvedValue(makeDocumentDraft()),
      });
      const useCase = new UpdateDocumentDraftContentUseCase({
        documentDraftRepository,
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        }),
      });
      return { useCase, documentDraftRepository };
    };
    const base = { userId: 'user-1', draftId: 'draft-1', contentJson: '{}', plainText: 'x' };

    it('persists trimmed instructions when provided', async () => {
      const { useCase, documentDraftRepository } = setup();
      await useCase.execute({ ...base, aiInstructions: '  Be brief ' });
      expect(documentDraftRepository.updateContent).toHaveBeenCalledWith('draft-1', {
        contentJson: '{}',
        plainText: 'x',
        aiInstructions: 'Be brief',
      });
    });

    it('does not touch them when absent', async () => {
      const { useCase, documentDraftRepository } = setup();
      await useCase.execute(base);
      expect(documentDraftRepository.updateContent).toHaveBeenCalledWith('draft-1', {
        contentJson: '{}',
        plainText: 'x',
      });
    });

    it('clears them when empty and rejects over-long ones', async () => {
      const { useCase, documentDraftRepository } = setup();
      await useCase.execute({ ...base, aiInstructions: '  ' });
      expect(vi.mocked(documentDraftRepository.updateContent).mock.calls[0]![1]).toMatchObject({
        aiInstructions: null,
      });
      await expect(
        useCase.execute({ ...base, aiInstructions: 'a'.repeat(501) }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
