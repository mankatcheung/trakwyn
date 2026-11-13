import { describe, it, expect, vi } from 'vitest';
import { UpdateDocumentDraftContentUseCase } from '#src/use-cases/documents/UpdateDocumentDraftContentUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import {
  makeDocumentDraftVersion,
  makeDocumentDraftVersionRepository,
} from '#src/__tests__/helpers/mocks/draftHistory.js';
import { DRAFT_HISTORY } from '#src/use-cases/constants.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('UpdateDocumentDraftContentUseCase', () => {
  it('throws NOT_FOUND when the draft does not exist', async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const useCase = new UpdateDocumentDraftContentUseCase({
      documentDraftVersionRepository: makeDocumentDraftVersionRepository(),
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
      documentDraftVersionRepository: makeDocumentDraftVersionRepository(),
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
      documentDraftVersionRepository: makeDocumentDraftVersionRepository(),
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
        documentDraftVersionRepository: makeDocumentDraftVersionRepository(),
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

  describe('draft history (JEF-584)', () => {
    const NOW = new Date('2024-06-01T12:00:00Z');
    const OLD =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"old"}]}]}';
    const NEW =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new"}]}]}';
    const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

    const setup = (
      opts: {
        latest?: ReturnType<typeof makeDocumentDraftVersion> | null;
        plainText?: string;
      } = {},
    ) => {
      const draft = makeDocumentDraft({ contentJson: OLD, plainText: opts.plainText ?? 'old' });
      const calls: string[] = [];
      const documentDraftRepository = makeDocumentDraftRepository({
        findById: vi.fn().mockResolvedValue(draft),
        updateContent: vi.fn().mockImplementation(async () => {
          calls.push('update');
          return draft;
        }),
      });
      const documentDraftVersionRepository = makeDocumentDraftVersionRepository({
        findLatestByDraft: vi.fn().mockResolvedValue(opts.latest ?? null),
        create: vi.fn().mockImplementation(async (data) => {
          calls.push('snapshot');
          return { ...data, createdAt: NOW };
        }),
      });
      const transactionManager = {
        run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
      };
      const useCase = new UpdateDocumentDraftContentUseCase({
        documentDraftRepository,
        documentDraftVersionRepository,
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
        }),
        transactionManager,
        now: () => NOW,
      });
      return {
        useCase,
        documentDraftVersionRepository,
        documentDraftRepository,
        calls,
        transactionManager,
      };
    };
    const edit = { userId: 'user-1', draftId: 'draft-1', contentJson: NEW, plainText: 'new' };

    it('snapshots the content being replaced, before replacing it, in one transaction', async () => {
      const { useCase, documentDraftVersionRepository, calls, transactionManager } = setup();
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: 'draft-1',
          contentJson: OLD,
          plainText: 'old',
          source: 'autosave',
        }),
      );
      expect(calls).toEqual(['snapshot', 'update']);
      expect(transactionManager.run).toHaveBeenCalledTimes(1);
    });

    it('trims the history to the cap after a snapshot', async () => {
      const { useCase, documentDraftVersionRepository } = setup();
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.pruneToLimit).toHaveBeenCalledWith(
        'draft-1',
        DRAFT_HISTORY.MAX_VERSIONS,
      );
    });

    it('does not snapshot again within the autosave interval', async () => {
      const { useCase, documentDraftVersionRepository, documentDraftRepository } = setup({
        latest: makeDocumentDraftVersion({ createdAt: minutesAgo(1), contentJson: '{"a":1}' }),
      });
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
      expect(documentDraftRepository.updateContent).toHaveBeenCalled();
    });

    it('snapshots once the interval has passed', async () => {
      const { useCase, documentDraftVersionRepository } = setup({
        latest: makeDocumentDraftVersion({
          createdAt: new Date(NOW.getTime() - DRAFT_HISTORY.AUTOSAVE_INTERVAL_MS - 1),
          contentJson: '{"a":1}',
        }),
      });
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.create).toHaveBeenCalledTimes(1);
    });

    it('does not snapshot when the content did not change', async () => {
      const { useCase, documentDraftVersionRepository } = setup();
      await useCase.execute({ ...edit, contentJson: OLD, plainText: 'old' });
      expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
    });

    it('does not keep a copy of a blank draft', async () => {
      const { useCase, documentDraftVersionRepository } = setup({ plainText: '   ' });
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
    });

    it('does not repeat the latest snapshot when it already holds this content', async () => {
      const { useCase, documentDraftVersionRepository } = setup({
        latest: makeDocumentDraftVersion({ createdAt: minutesAgo(60), contentJson: OLD }),
      });
      await useCase.execute(edit);
      expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
    });

    it('always snapshots before an AI replace, even inside the interval, labelled ai', async () => {
      const { useCase, documentDraftVersionRepository } = setup({
        latest: makeDocumentDraftVersion({ createdAt: minutesAgo(1), contentJson: '{"a":1}' }),
      });
      await useCase.execute({ ...edit, replacedByAi: true });
      expect(documentDraftVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentJson: OLD, source: 'ai' }),
      );
    });
  });
});
