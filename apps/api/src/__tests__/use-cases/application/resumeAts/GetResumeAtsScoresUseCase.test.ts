import { describe, it, expect, vi } from 'vitest';
import { GetResumeAtsScoresUseCase } from '#src/use-cases/application/GetResumeAtsScoresUseCase.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeResumeAtsScoreRepository,
  makeSavedAtsScore,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const draft = (plainText: string) =>
  makeDocumentDraft({ id: 'draft-1', type: 'resume', plainText });

function makeDeps(opts: { drafts?: unknown[]; scores?: unknown[]; app?: unknown } = {}) {
  return {
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(opts.app === undefined ? makeApplication() : opts.app),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(opts.drafts ?? []),
    }),
    resumeAtsScoreRepository: makeResumeAtsScoreRepository({
      findByApplicationId: vi.fn().mockResolvedValue(opts.scores ?? []),
    }),
  };
}

const run = (deps: ReturnType<typeof makeDeps>) =>
  new GetResumeAtsScoresUseCase(deps as never).execute({
    userId: 'user-1',
    applicationId: 'app-1',
  });

describe('GetResumeAtsScoresUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const err = await run(makeDeps({ app: null })).catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to someone else', async () => {
    const err = await run(makeDeps({ app: makeApplication({ userId: 'user-2' }) })).catch((e) => e);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('returns nothing when no resume has been checked', async () => {
    expect(await run(makeDeps())).toEqual([]);
  });

  it('returns the saved result with its checks', async () => {
    const saved = makeSavedAtsScore({ resumeTextHash: hashResumeText('same text') });
    const [result] = await run(makeDeps({ drafts: [draft('same text')], scores: [saved] }));

    expect(result).toMatchObject({ score: 81, label: 'Good', readable: true, isStale: false });
    expect(result.checks).toEqual(saved.checks);
  });

  it('is stale once the draft text has changed, and clears when the edit is undone', async () => {
    const saved = makeSavedAtsScore({ resumeTextHash: hashResumeText('original text') });

    const edited = await run(makeDeps({ drafts: [draft('edited text')], scores: [saved] }));
    const undone = await run(makeDeps({ drafts: [draft('original text')], scores: [saved] }));

    expect(edited[0].isStale).toBe(true);
    expect(undone[0].isStale).toBe(false);
  });

  it('ignores surrounding whitespace changes', async () => {
    const saved = makeSavedAtsScore({ resumeTextHash: hashResumeText('same text') });
    const deps = makeDeps({ drafts: [draft('  same text\n')], scores: [saved] });

    expect((await run(deps))[0].isStale).toBe(false);
  });

  it('never marks an uploaded file stale, since a re-upload is a new document', async () => {
    const saved = makeSavedAtsScore({ documentDraftId: null, documentId: 'doc-1' });

    expect((await run(makeDeps({ scores: [saved] })))[0].isStale).toBe(false);
  });
});
