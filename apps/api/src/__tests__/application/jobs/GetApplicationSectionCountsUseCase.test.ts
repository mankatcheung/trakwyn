import { describe, it, expect, vi } from 'vitest';
import { GetApplicationSectionCountsUseCase } from '#src/use-cases/jobs/GetApplicationSectionCountsUseCase.js';
import { makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import {
  makeDocumentDraftRepository,
  makeDocumentRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeInterviewRoundRepository } from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import { makeOfferRepository } from '#src/__tests__/helpers/mocks/offers.js';
import { makeCompanyBriefingRepository } from '#src/__tests__/helpers/mocks/llm.js';
import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';

const BRIEFING: CompanyBriefing = {
  id: 'briefing-1',
  applicationId: 'app-1',
  content: 'About the company',
  generatedAt: new Date('2024-01-01'),
};

function makeUseCase(
  counts?: Partial<Record<string, number>>,
  appUserId = 'user-1',
  briefing: CompanyBriefing | null = null,
) {
  const c = (n: number | undefined) => vi.fn().mockResolvedValue(n ?? 0);
  const deps = {
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: appUserId })),
    }),
    noteRepository: makeNoteRepository({ countByApplicationId: c(counts?.notes) }),
    interviewRoundRepository: makeInterviewRoundRepository({
      countByApplicationId: c(counts?.interviews),
    }),
    contactRepository: makeContactRepository({ countByApplicationId: c(counts?.contacts) }),
    offerRepository: makeOfferRepository({ countByApplicationId: c(counts?.offers) }),
    documentRepository: makeDocumentRepository({ countByApplicationId: c(counts?.documents) }),
    documentDraftRepository: makeDocumentDraftRepository({
      countByApplicationId: c(counts?.drafts),
    }),
    companyBriefingRepository: makeCompanyBriefingRepository({
      findByApplicationId: vi.fn().mockResolvedValue(briefing),
    }),
  };
  return { useCase: new GetApplicationSectionCountsUseCase(deps), deps };
}

describe('GetApplicationSectionCountsUseCase', () => {
  it('returns a count for every section the index shows', async () => {
    const ctx = makeUseCase({
      notes: 3,
      interviews: 2,
      contacts: 1,
      documents: 4,
      drafts: 2,
      offers: 1,
    });

    const counts = await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(counts).toEqual({
      notes: 3,
      interviews: 2,
      contacts: 1,
      documents: 4,
      documentDrafts: 2,
      offers: 1,
      companyBriefing: false,
    });
  });

  it('reports whether a company briefing has been generated', async () => {
    const generated = makeUseCase(undefined, 'user-1', BRIEFING);
    const missing = makeUseCase();

    const withBriefing = await generated.useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
    });
    const without = await missing.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(withBriefing.companyBriefing).toBe(true);
    expect(without.companyBriefing).toBe(false);
    expect(generated.deps.companyBriefingRepository.findByApplicationId).toHaveBeenCalledWith(
      'app-1',
    );
  });

  it('reports zero rather than omitting an empty section', async () => {
    // The index dims empty rows, so it needs a 0 — an absent key would render
    // the same as "not loaded yet".
    const ctx = makeUseCase();

    const counts = await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(counts.notes).toBe(0);
    expect(counts.offers).toBe(0);
  });

  it('throws NOT_FOUND for an application that does not exist or is in Trash', async () => {
    const ctx = makeUseCase();
    ctx.deps.applicationRepository = makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const useCase = new GetApplicationSectionCountsUseCase(ctx.deps);

    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it("refuses someone else's application without counting anything", async () => {
    const ctx = makeUseCase(undefined, 'someone-else');

    const err = await ctx.useCase
      .execute({ userId: 'user-1', applicationId: 'app-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(ctx.deps.noteRepository.countByApplicationId).not.toHaveBeenCalled();
    expect(ctx.deps.companyBriefingRepository.findByApplicationId).not.toHaveBeenCalled();
  });
});
