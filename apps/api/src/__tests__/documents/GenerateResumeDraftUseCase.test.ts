import { describe, it, expect, vi } from 'vitest';
import { GenerateResumeDraftUseCase } from '#src/use-cases/documents/GenerateResumeDraftUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const RESUME = {
  summary: 'Engineer.',
  experience: [{ company: 'Acme', title: 'Engineer', bullets: ['Built widgets'] }],
  education: [{ institution: 'State University', qualification: 'BSc' }],
  skills: [{ category: 'Languages', items: ['TypeScript'] }],
};

function makeUseCase(over?: {
  generate?: ReturnType<typeof vi.fn>;
  user?: ReturnType<typeof makeUser> | null;
}) {
  const userRepository = makeUserRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        over?.user === undefined
          ? makeUser({ name: 'Ada Lovelace', email: 'ada@example.com' })
          : over.user,
      ),
  });
  const generateResumeUseCase = {
    execute: (over?.generate ?? vi.fn().mockResolvedValue(RESUME)) as unknown as (i: {
      userId: string;
      applicationId: string;
    }) => Promise<typeof RESUME>,
  };
  const documentDraftRepository = makeDocumentDraftRepository({
    create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
  });
  const applicationRepository = makeApplicationRepository({
    findById: vi
      .fn()
      .mockResolvedValue(
        makeApplication({ userId: 'user-1', company: 'Initech', role: 'Engineer' }),
      ),
  });
  return {
    useCase: new GenerateResumeDraftUseCase({
      generateResumeUseCase,
      documentDraftRepository,
      applicationRepository,
      userRepository,
      generateId: () => 'draft-new',
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    }),
    generateResumeUseCase,
    documentDraftRepository,
  };
}

describe('GenerateResumeDraftUseCase', () => {
  it('saves the generated resume as a resume draft', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(ctx.documentDraftRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1', type: 'resume' }),
    );
  });

  it('stores structured editor content, not flat prose', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    const [data] = vi.mocked(ctx.documentDraftRepository.create).mock.calls[0]!;
    const doc = JSON.parse(data.contentJson!) as { content: Array<{ type: string }> };
    expect(doc.content.map((n) => n.type)).toContain('heading');
    expect(data.plainText).toContain('Built widgets');
  });

  it('starts the draft with the user name and account email', async () => {
    const ctx = makeUseCase();

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    const [data] = vi.mocked(ctx.documentDraftRepository.create).mock.calls[0]!;
    expect(data.plainText!.startsWith('Ada Lovelace\nada@example.com\n')).toBe(true);
    const doc = JSON.parse(data.contentJson!) as { content: Array<{ type: string }> };
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
  });

  it('still adds the email line for a user with no name', async () => {
    const ctx = makeUseCase({ user: makeUser({ name: null, email: 'ada@example.com' }) });

    await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    const [data] = vi.mocked(ctx.documentDraftRepository.create).mock.calls[0]!;
    expect(data.plainText!.startsWith('ada@example.com\n')).toBe(true);
    const doc = JSON.parse(data.contentJson!) as { content: Array<{ type: string }> };
    expect(doc.content[0]!.type).toBe('paragraph');
  });

  it('names the draft after the application', async () => {
    const ctx = makeUseCase();

    const draft = await ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' });

    expect(draft.title).toContain('Initech');
  });

  it('creates nothing when generation is refused', async () => {
    // A resume rejected for naming an employer the user never entered must
    // not leave a half-made draft behind.
    const ctx = makeUseCase({ generate: vi.fn().mockRejectedValue(new Error('refused')) });

    await expect(
      ctx.useCase.execute({ userId: 'user-1', applicationId: 'app-1' }),
    ).rejects.toThrow();
    expect(ctx.documentDraftRepository.create).not.toHaveBeenCalled();
  });

  it("refuses someone else's application before calling the model", async () => {
    const ctx = makeUseCase();
    const useCase = new GenerateResumeDraftUseCase({
      generateResumeUseCase: ctx.generateResumeUseCase,
      documentDraftRepository: ctx.documentDraftRepository,
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'someone-else' })),
      }),
      userRepository: makeUserRepository(),
      generateId: () => 'draft-new',
      now: () => new Date(),
    });

    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(ctx.generateResumeUseCase.execute).not.toHaveBeenCalled();
  });
});
