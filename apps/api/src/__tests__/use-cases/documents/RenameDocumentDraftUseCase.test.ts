import { describe, it, expect, vi } from 'vitest';
import { RenameDocumentDraftUseCase } from '#src/use-cases/documents/RenameDocumentDraftUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const makeUseCase = (over?: Parameters<typeof makeDocumentDraftRepository>[0]) => {
  const documentDraftRepository = makeDocumentDraftRepository({
    findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
    rename: vi
      .fn()
      .mockImplementation((_id: string, title: string) =>
        Promise.resolve(makeDocumentDraft({ title })),
      ),
    ...over,
  });
  const applicationRepository = makeApplicationRepository({
    findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
  });
  return {
    useCase: new RenameDocumentDraftUseCase({ documentDraftRepository, applicationRepository }),
    documentDraftRepository,
    applicationRepository,
  };
};

describe('RenameDocumentDraftUseCase', () => {
  it('renames the draft', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute({
      userId: 'user-1',
      draftId: 'draft-1',
      title: 'Tailored for Stripe',
    });

    expect(ctx.documentDraftRepository.rename).toHaveBeenCalledWith(
      'draft-1',
      'Tailored for Stripe',
    );
    expect(result.title).toBe('Tailored for Stripe');
  });

  it('trims surrounding whitespace', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', draftId: 'draft-1', title: '  Spaced  ' });

    expect(ctx.documentDraftRepository.rename).toHaveBeenCalledWith('draft-1', 'Spaced');
  });

  it('rejects a blank title rather than storing an unnameable draft', async () => {
    const ctx = makeUseCase();

    const err = await ctx.useCase
      .execute({ userId: 'user-1', draftId: 'draft-1', title: '   ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(ctx.documentDraftRepository.rename).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const ctx = makeUseCase({ findById: vi.fn().mockResolvedValue(null) });

    const err = await ctx.useCase
      .execute({ userId: 'user-1', draftId: 'missing', title: 'x' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("refuses a draft on someone else's application", async () => {
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(makeDocumentDraft()),
      rename: vi.fn(),
    });
    const applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'someone-else' })),
    });
    const useCase = new RenameDocumentDraftUseCase({
      documentDraftRepository,
      applicationRepository,
    });

    const err = await useCase
      .execute({ userId: 'user-1', draftId: 'draft-1', title: 'x' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(documentDraftRepository.rename).not.toHaveBeenCalled();
  });
});
