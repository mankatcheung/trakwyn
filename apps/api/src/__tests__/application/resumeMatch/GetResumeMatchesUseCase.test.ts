import { describe, it, expect, vi } from 'vitest';
import { GetResumeMatchesUseCase } from '#src/use-cases/application/GetResumeMatchesUseCase.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeResumeMatch,
  makeResumeMatchRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

const draft = (plainText: string) =>
  makeDocumentDraft({ id: 'draft-1', type: 'resume', plainText });

function makeDeps(opts: { drafts?: unknown[]; matches?: unknown[]; app?: unknown } = {}) {
  return {
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(opts.app === undefined ? makeApplication() : opts.app),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findAllByApplicationId: vi.fn().mockResolvedValue(opts.drafts ?? []),
    }),
    resumeMatchRepository: makeResumeMatchRepository({
      findByApplicationId: vi.fn().mockResolvedValue(opts.matches ?? []),
    }),
  };
}

const run = (deps: ReturnType<typeof makeDeps>) =>
  new GetResumeMatchesUseCase(deps as never).execute({ userId: 'user-1', applicationId: 'app-1' });

describe('GetResumeMatchesUseCase', () => {
  it('throws NOT_FOUND when the application does not exist', async () => {
    const err = await run(makeDeps({ app: null })).catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when the application belongs to someone else', async () => {
    const err = await run(makeDeps({ app: makeApplication({ userId: 'user-2' }) })).catch((e) => e);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('returns no matches when none were generated', async () => {
    expect(await run(makeDeps())).toEqual([]);
  });

  it('is not stale while the draft text still hashes to what was scored', async () => {
    const deps = makeDeps({
      drafts: [draft('same text')],
      matches: [makeResumeMatch({ resumeTextHash: hashResumeText('same text') })],
    });

    expect((await run(deps))[0].isStale).toBe(false);
  });

  it('is stale once the draft text has changed', async () => {
    const deps = makeDeps({
      drafts: [draft('edited text')],
      matches: [makeResumeMatch({ resumeTextHash: hashResumeText('original text') })],
    });

    expect((await run(deps))[0].isStale).toBe(true);
  });

  it('clears again when the edit is undone', async () => {
    const deps = makeDeps({
      drafts: [draft('original text')],
      matches: [makeResumeMatch({ resumeTextHash: hashResumeText('original text') })],
    });

    expect((await run(deps))[0].isStale).toBe(false);
  });

  it('ignores surrounding whitespace changes', async () => {
    const deps = makeDeps({
      drafts: [draft('  same text\n')],
      matches: [makeResumeMatch({ resumeTextHash: hashResumeText('same text') })],
    });

    expect((await run(deps))[0].isStale).toBe(false);
  });

  it('never marks an uploaded resume stale', async () => {
    const deps = makeDeps({
      matches: [makeResumeMatch({ documentDraftId: null, documentId: 'doc-1' })],
    });

    expect((await run(deps))[0].isStale).toBe(false);
  });

  it('treats a match whose draft is gone from the list as stale rather than crashing', async () => {
    const deps = makeDeps({ matches: [makeResumeMatch()] });

    expect((await run(deps))[0].isStale).toBe(true);
  });
});
