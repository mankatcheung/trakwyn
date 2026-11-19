import { describe, it, expect, vi } from 'vitest';
import { GenerateCoverLetterDraftUseCase } from '#src/use-cases/documents/GenerateCoverLetterDraftUseCase.js';
import {
  makeDocument,
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const GENERATED = 'Dear hiring manager,\n\nI am writing to apply.';

function makeUseCase(over?: {
  generate?: ReturnType<typeof vi.fn>;
  draftRepo?: Parameters<typeof makeDocumentDraftRepository>[0];
  appRepo?: Parameters<typeof makeApplicationRepository>[0];
  documentRepo?: Parameters<typeof makeDocumentRepository>[0];
  extract?: ReturnType<typeof vi.fn>;
}) {
  const generateCoverLetterUseCase = {
    execute: (over?.generate ?? vi.fn().mockResolvedValue(GENERATED)) as unknown as (input: {
      userId: string;
      applicationId: string;
      resumeText?: string | null;
    }) => Promise<string>,
  };
  const documentDraftRepository = makeDocumentDraftRepository({
    create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
    ...over?.draftRepo,
  });
  const applicationRepository = makeApplicationRepository({
    findById: vi
      .fn()
      .mockResolvedValue(makeApplication({ userId: 'user-1', company: 'Acme', role: 'Engineer' })),
    ...over?.appRepo,
  });
  const documentRepository = makeDocumentRepository(over?.documentRepo);
  const extractDocumentTextUseCase = {
    execute: (over?.extract ??
      vi.fn().mockResolvedValue({ text: 'resume from a file' })) as unknown as (query: {
      userId: string;
      documentId: string;
    }) => Promise<{ text: string }>,
  };
  return {
    useCase: new GenerateCoverLetterDraftUseCase({
      generateCoverLetterUseCase,
      documentDraftRepository,
      documentRepository,
      extractDocumentTextUseCase,
      applicationRepository,
      generateId: () => 'draft-new',
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    }),
    generateCoverLetterUseCase,
    documentDraftRepository,
    documentRepository,
    extractDocumentTextUseCase,
    applicationRepository,
  };
}

describe('GenerateCoverLetterDraftUseCase', () => {
  it('persists what it generated instead of returning it and forgetting', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    // This is the bug the ticket is about: the model's output used to live in
    // component state and nowhere else.
    expect(ctx.documentDraftRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-1',
        type: 'cover_letter',
        plainText: GENERATED,
      }),
    );
  });

  it('stores editor-ready content, not raw prose', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    const [data] = vi.mocked(ctx.documentDraftRepository.create).mock.calls[0]!;
    expect(JSON.parse(data.contentJson!)).toMatchObject({ type: 'doc' });
  });

  it('names the draft after the application so a list of them is readable', async () => {
    const ctx = makeUseCase();

    const draft = await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(draft.title).toContain('Acme');
    expect(draft.title).toContain('Engineer');
  });

  it('passes the optional resume text through to generation', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      resumeText: 'my resume',
    });

    expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      resumeText: 'my resume',
    });
  });

  it('does not create a draft when generation fails', async () => {
    // A rate limit or a missing API key must not leave an empty draft behind.
    const ctx = makeUseCase({ generate: vi.fn().mockRejectedValue(new Error('rate limited')) });

    await expect(
      ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toThrow();
    expect(ctx.documentDraftRepository.create).not.toHaveBeenCalled();
  });

  it("refuses someone else's application before calling the model", async () => {
    const ctx = makeUseCase({
      appRepo: {
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'someone-else' })),
      },
    });

    const err = await ctx.useCase
      .execute({ userId: 'user-1', applicationId: 'app-1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
  });

  describe("basing the letter on one of the application's resumes (JEF-396)", () => {
    const resumeDraft = makeDocumentDraft({
      id: 'resume-draft-1',
      applicationId: 'app-1',
      type: 'resume',
      plainText: 'resume from a draft',
    });
    const resumeFile = makeDocument({
      id: 'resume-doc-1',
      applicationId: 'app-1',
      documentType: 'resume',
    });

    it('uses the text of a resume draft', async () => {
      const ctx = makeUseCase({
        draftRepo: {
          findById: vi.fn().mockResolvedValue(resumeDraft),
          create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
        },
      });

      await ctx.useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        resumeDraftId: 'resume-draft-1',
      });

      expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ resumeText: 'resume from a draft' }),
      );
    });

    it('extracts the text of an uploaded resume, as the user, server-side', async () => {
      const ctx = makeUseCase({
        documentRepo: { findById: vi.fn().mockResolvedValue(resumeFile) },
      });

      await ctx.useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        resumeDocumentId: 'resume-doc-1',
      });

      expect(ctx.extractDocumentTextUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        documentId: 'resume-doc-1',
      });
      expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ resumeText: 'resume from a file' }),
      );
    });

    it('prefers a selected resume over legacy pasted text', async () => {
      const ctx = makeUseCase({
        draftRepo: {
          findById: vi.fn().mockResolvedValue(resumeDraft),
          create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
        },
      });

      await ctx.useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        resumeDraftId: 'resume-draft-1',
        resumeText: 'pasted',
      });

      expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ resumeText: 'resume from a draft' }),
      );
    });

    it('refuses a resume that belongs to a different application', async () => {
      // "This application's resumes" is the rule, and also the guard: an id
      // from another application (even the user's own) is not a resume here.
      const ctx = makeUseCase({
        draftRepo: {
          findById: vi.fn().mockResolvedValue({ ...resumeDraft, applicationId: 'app-2' }),
        },
      });

      const err = await ctx.useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', resumeDraftId: 'resume-draft-1' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('NOT_FOUND');
      expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
    });

    it('refuses a missing resume', async () => {
      const ctx = makeUseCase({ documentRepo: { findById: vi.fn().mockResolvedValue(null) } });

      const err = await ctx.useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', resumeDocumentId: 'nope' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('NOT_FOUND');
    });

    it('refuses an item that is not a resume', async () => {
      const ctx = makeUseCase({
        draftRepo: {
          findById: vi.fn().mockResolvedValue({ ...resumeDraft, type: 'cover_letter' as const }),
        },
      });

      const err = await ctx.useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', resumeDraftId: 'resume-draft-1' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
    });

    it('refuses an uploaded file whose type is not resume', async () => {
      const ctx = makeUseCase({
        documentRepo: {
          findById: vi.fn().mockResolvedValue({ ...resumeFile, documentType: 'portfolio' }),
        },
      });

      const err = await ctx.useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', resumeDocumentId: 'resume-doc-1' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
    });

    it('refuses two resumes at once rather than guessing', async () => {
      const ctx = makeUseCase();

      const err = await ctx.useCase
        .execute({
          userId: 'user-1',
          applicationId: 'app-1',
          resumeDraftId: 'a',
          resumeDocumentId: 'b',
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
