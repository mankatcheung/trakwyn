import { describe, it, expect, vi } from 'vitest';
import { GenerateIntoDocumentDraftUseCase } from '#src/use-cases/documents/GenerateIntoDocumentDraftUseCase.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
  makeExtractDocumentTextUseCase,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

import { makeAiFeedbackRepository } from '#src/__tests__/helpers/mocks/aiFeedback.js';
import type { LLMAnsweredBy } from '#src/use-cases/ports/ILLMProvider.js';
import { resumePrompt } from '#src/use-cases/prompts/resume.js';
import { coverLetterPrompt } from '#src/use-cases/prompts/coverLetter.js';

const RESUME = {
  summary: 'Engineer.',
  experience: [{ company: 'Acme', title: 'Engineer', bullets: ['Built widgets'] }],
  education: [],
  skills: [],
};

function makeUseCase(over?: {
  draft?: ReturnType<typeof makeDocumentDraft> | null;
  ownerId?: string;
  resumeDraft?: ReturnType<typeof makeDocumentDraft> | null;
}) {
  const draft = over?.draft === undefined ? makeDocumentDraft() : over.draft;
  const generateCoverLetterUseCase = { execute: vi.fn().mockResolvedValue('Dear team,\n\nHello.') };
  const generateResumeUseCase = { execute: vi.fn().mockResolvedValue(RESUME) };
  const documentDraftRepository = makeDocumentDraftRepository({
    findById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(id === 'draft-1' ? draft : (over?.resumeDraft ?? null)),
      ),
  });
  const useCase = new GenerateIntoDocumentDraftUseCase({
    generateCoverLetterUseCase,
    generateResumeUseCase,
    documentDraftRepository,
    aiFeedbackRepository: makeAiFeedbackRepository(),
    documentRepository: makeDocumentRepository(),
    extractDocumentTextUseCase: makeExtractDocumentTextUseCase(),
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ userId: over?.ownerId ?? 'user-1' })),
    }),
    userRepository: makeUserRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeUser({ name: 'Ada Lovelace', email: 'ada@example.com' })),
    }),
  });
  return { useCase, generateCoverLetterUseCase, generateResumeUseCase, documentDraftRepository };
}

const input = { userId: 'user-1', draftId: 'draft-1' };

describe('GenerateIntoDocumentDraftUseCase', () => {
  it('adds the name and email header when generating into a resume draft', async () => {
    const ctx = makeUseCase({ draft: makeDocumentDraft({ type: 'resume' }) });

    const result = await ctx.useCase.execute(input);

    expect(result.plainText.startsWith('Ada Lovelace\nada@example.com\n')).toBe(true);
    expect(JSON.parse(result.contentJson).content[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
    });
  });

  it('adds no header to a cover letter', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute(input);

    expect(result.plainText).not.toContain('ada@example.com');
  });

  it('generates a cover letter with instructions and saves nothing', async () => {
    const ctx = makeUseCase();

    const result = await ctx.useCase.execute({ ...input, instructions: 'Warmer tone' });

    expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      resumeText: undefined,
      instructions: 'Warmer tone',
      onAnswered: expect.any(Function),
    });
    expect(result.plainText).toBe('Dear team,\n\nHello.');
    expect(JSON.parse(result.contentJson)).toMatchObject({ type: 'doc' });
    expect(ctx.documentDraftRepository.create).not.toHaveBeenCalled();
    expect(ctx.documentDraftRepository.updateContent).not.toHaveBeenCalled();
  });

  it('bases a cover letter on a chosen resume draft of the same application', async () => {
    const ctx = makeUseCase({
      resumeDraft: makeDocumentDraft({ id: 'resume-1', type: 'resume', plainText: 'My resume' }),
    });

    await ctx.useCase.execute({ ...input, resumeDraftId: 'resume-1' });

    expect(ctx.generateCoverLetterUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ resumeText: 'My resume' }),
    );
  });

  it('refuses a resume draft from another application', async () => {
    const ctx = makeUseCase({
      resumeDraft: makeDocumentDraft({ id: 'resume-1', type: 'resume', applicationId: 'other' }),
    });

    await expect(
      ctx.useCase.execute({ ...input, resumeDraftId: 'resume-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
  });

  it('refuses two resumes at once', async () => {
    const ctx = makeUseCase();

    await expect(
      ctx.useCase.execute({ ...input, resumeDraftId: 'a', resumeDocumentId: 'b' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('generates a resume as editor content with instructions and saves nothing', async () => {
    const ctx = makeUseCase({ draft: makeDocumentDraft({ type: 'resume' }) });

    const result = await ctx.useCase.execute({ ...input, instructions: 'Focus on backend' });

    expect(ctx.generateResumeUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      instructions: 'Focus on backend',
      onAnswered: expect.any(Function),
    });
    expect(result.plainText).toContain('Built widgets');
    expect(ctx.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
    expect(ctx.documentDraftRepository.create).not.toHaveBeenCalled();
    expect(ctx.documentDraftRepository.updateContent).not.toHaveBeenCalled();
  });

  it('refuses a missing draft and someone else’s before generating', async () => {
    const missing = makeUseCase({ draft: null });
    await expect(missing.useCase.execute(input)).rejects.toBeInstanceOf(NotFoundError);

    const foreign = makeUseCase({ ownerId: 'someone-else' });
    await expect(foreign.useCase.execute(input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(foreign.generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
  });
});

describe('GenerateIntoDocumentDraftUseCase generation snapshot (JEF-547)', () => {
  type Answered = LLMAnsweredBy | undefined;

  function setup(draftType: 'resume' | 'cover_letter', answeredBy: Answered) {
    const draft = makeDocumentDraft({ id: 'draft-1', type: draftType });
    const aiFeedbackRepository = makeAiFeedbackRepository();
    const documentDraftRepository = makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(draft),
    });
    const report = (input: { onAnswered?: (a: Answered) => void }) =>
      input.onAnswered?.(answeredBy);
    const useCase = new GenerateIntoDocumentDraftUseCase({
      generateCoverLetterUseCase: {
        execute: vi.fn().mockImplementation(async (input) => {
          report(input);
          return 'Dear team,\n\nHello.';
        }),
      },
      generateResumeUseCase: {
        execute: vi.fn().mockImplementation(async (input) => {
          report(input);
          return RESUME;
        }),
      },
      documentDraftRepository,
      aiFeedbackRepository,
      documentRepository: makeDocumentRepository(),
      extractDocumentTextUseCase: makeExtractDocumentTextUseCase(),
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ name: 'Ada', email: 'ada@example.com' })),
      }),
    });
    return { useCase, documentDraftRepository, aiFeedbackRepository };
  }

  it('notes on the draft which model and prompt wrote a resume', async () => {
    const { useCase, documentDraftRepository } = setup('resume', {
      provider: 'google',
      model: 'gem-1',
      source: 'byok',
    });

    await useCase.execute(input);

    expect(documentDraftRepository.recordGeneration).toHaveBeenCalledWith('draft-1', {
      provider: 'google',
      model: 'gem-1',
      promptVersion: resumePrompt.version,
      source: 'byok',
      tier: null,
      traceId: null,
    });
  });

  it('notes the hosted tier and the cover letter prompt version on a cover letter', async () => {
    const { useCase, documentDraftRepository } = setup('cover_letter', {
      provider: 'workersai',
      model: '@cf/test',
      source: 'platform',
      tier: 'mid',
    });

    await useCase.execute(input);

    expect(documentDraftRepository.recordGeneration).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        promptVersion: coverLetterPrompt.version,
        source: 'platform',
        tier: 'mid',
      }),
    );
  });

  it('notes nothing when the provider reports no model', async () => {
    const { useCase, documentDraftRepository } = setup('resume', undefined);

    await useCase.execute(input);

    expect(documentDraftRepository.recordGeneration).not.toHaveBeenCalled();
  });

  it("clears the caller's rating of the draft, since the new output is not what was rated", async () => {
    const { useCase, aiFeedbackRepository } = setup('resume', {
      provider: 'google',
      model: 'gem-1',
      source: 'byok',
    });

    await useCase.execute(input);

    expect(aiFeedbackRepository.clear).toHaveBeenCalledWith('user-1', 'document_draft', 'draft-1');
  });

  it('keeps the rating when nothing new was recorded', async () => {
    const { useCase, aiFeedbackRepository } = setup('resume', undefined);

    await useCase.execute(input);

    expect(aiFeedbackRepository.clear).not.toHaveBeenCalled();
  });
});
