import { describe, it, expect, vi } from 'vitest';
import { ComputeResumeAtsScoreUseCase } from '#src/use-cases/application/ComputeResumeAtsScoreUseCase.js';
import { MIME_TYPE, RESUME_TEXT_EXTRACTION } from '#src/use-cases/constants.js';
import {
  makeDocument,
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
  makeDocumentTextExtractor,
  makeStorageProvider,
  makeStoredObject,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

// Short on purpose: every check passes except the 300-word minimum, so 90.
const READABLE = [
  'Jane Doe',
  'jane.doe@example.com',
  '+1 415 555 0134',
  'Work Experience',
  'Engineer, Acme — Jan 2021 – Present',
  '- Cut page load time by 40%',
  '- Led a team of 6 engineers',
  '- Shipped 12 releases',
  'Education',
  'BSc, State University — 2013 – 2017',
  'Skills',
  'TypeScript, GraphQL, PostgreSQL',
].join('\n');

const resumeDraft = (overrides = {}) =>
  makeDocumentDraft({ id: 'draft-1', type: 'resume', plainText: READABLE, ...overrides });

const uploadedResume = (overrides = {}) =>
  makeDocument({ id: 'doc-1', documentType: 'resume', mimeType: MIME_TYPE.PDF, ...overrides });

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ id: 'app-1', userId: 'user-1' })),
    }),
    documentRepository: makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(uploadedResume()),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(resumeDraft()),
    }),
    storageProvider: makeStorageProvider(),
    documentTextExtractor: makeDocumentTextExtractor({
      extract: vi.fn().mockResolvedValue(READABLE),
    }),
    computeResumeAtsScoreRateLimiter: makeRateLimiter(),
    ...overrides,
  };
}

const run = (deps: ReturnType<typeof makeDeps>, input: Record<string, unknown> = {}) =>
  new ComputeResumeAtsScoreUseCase(deps as never).execute({
    userId: 'user-1',
    documentDraftId: 'draft-1',
    ...input,
  });

const upload = { documentDraftId: null, documentId: 'doc-1' };
const codeOf = (err: unknown) => (err as { code: string }).code;

describe('ComputeResumeAtsScoreUseCase', () => {
  describe('guards', () => {
    it.each([
      ['neither a draft nor a document', { documentDraftId: null, documentId: null }],
      ['both a draft and a document', { documentDraftId: 'draft-1', documentId: 'doc-1' }],
    ])('throws VALIDATION when given %s', async (_label, input) => {
      const deps = makeDeps();
      expect(codeOf(await run(deps, input).catch((e) => e))).toBe('VALIDATION');
      expect(deps.computeResumeAtsScoreRateLimiter.consume).not.toHaveBeenCalled();
    });

    it('throws RATE_LIMITED, keyed per user, when the limiter rejects the request', async () => {
      const consume = vi.fn().mockResolvedValue(false);
      const deps = makeDeps({ computeResumeAtsScoreRateLimiter: makeRateLimiter({ consume }) });

      expect(codeOf(await run(deps).catch((e) => e))).toBe('RATE_LIMITED');
      expect(consume).toHaveBeenCalledWith('resume-ats:user:user-1');
      expect(deps.documentDraftRepository.findById).not.toHaveBeenCalled();
    });

    it.each([
      ['draft', {}, 'documentDraftRepository'],
      ['document', upload, 'documentRepository'],
    ])("throws FORBIDDEN for another user's %s", async (_label, input, repo) => {
      const deps = makeDeps({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-2' })),
        }),
      });
      expect(codeOf(await run(deps, input).catch((e) => e))).toBe('FORBIDDEN');
      expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
      expect(
        (deps as never as Record<string, { findById: unknown }>)[repo].findById,
      ).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when the draft is missing', async () => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(null),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('NOT_FOUND');
    });

    it('throws NOT_FOUND when the draft is a cover letter', async () => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(resumeDraft({ type: 'cover_letter' })),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('NOT_FOUND');
    });

    it.each([
      ['missing', null],
      ['not a resume', uploadedResume({ documentType: 'cover_letter' })],
    ])('throws NOT_FOUND when the document is %s', async (_label, doc) => {
      const deps = makeDeps({
        documentRepository: makeDocumentRepository({ findById: vi.fn().mockResolvedValue(doc) }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('NOT_FOUND');
    });

    it('throws NOT_FOUND when the application is gone', async () => {
      const deps = makeDeps({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(null),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('NOT_FOUND');
    });
  });

  describe('a resume draft', () => {
    it('scores the draft text without touching storage', async () => {
      const deps = makeDeps();
      const result = await run(deps);

      expect(result).toMatchObject({ readable: true, score: 90, label: 'Excellent' });
      expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
    });

    it("checks ownership through the draft's application", async () => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(resumeDraft({ applicationId: 'app-9' })),
        }),
      });
      await run(deps);
      expect(deps.applicationRepository.findById).toHaveBeenCalledWith('app-9');
    });

    it('reports an empty draft as not readable rather than failing', async () => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(resumeDraft({ plainText: '' })),
        }),
      });
      expect(await run(deps)).toMatchObject({ score: 0, readable: false });
    });

    it('scores the same text the same each time', async () => {
      const deps = makeDeps();
      expect(await run(deps)).toEqual(await run(deps));
    });
  });

  describe('an uploaded resume', () => {
    it('reads the file from storage by key and scores the extracted text', async () => {
      const deps = makeDeps();
      const result = await run(deps, upload);

      expect(deps.storageProvider.getObject).toHaveBeenCalledWith(expect.any(String));
      expect(deps.documentTextExtractor.extract).toHaveBeenCalledWith(
        expect.any(Buffer),
        MIME_TYPE.PDF,
      );
      expect(result.readable).toBe(true);
      expect(result.score).toBe(90);
    });

    it('reports a scanned PDF (no extractable text) as not readable', async () => {
      const deps = makeDeps({
        documentTextExtractor: makeDocumentTextExtractor({
          extract: vi.fn().mockResolvedValue('  \n'),
        }),
      });
      expect(await run(deps, upload)).toMatchObject({
        score: 0,
        label: 'Not readable by an ATS',
        readable: false,
      });
    });

    it.each([MIME_TYPE.PNG, MIME_TYPE.JPEG])(
      'reports an image (%s) as not readable without reading it',
      async (mimeType) => {
        const deps = makeDeps({
          documentRepository: makeDocumentRepository({
            findById: vi.fn().mockResolvedValue(uploadedResume({ mimeType })),
          }),
        });
        expect(await run(deps, upload)).toMatchObject({ score: 0, readable: false });
        expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
      },
    );

    it('throws VALIDATION when the stored file is over the size cap', async () => {
      const deps = makeDeps({
        storageProvider: makeStorageProvider({
          getObject: vi
            .fn()
            .mockResolvedValue(makeStoredObject('x', RESUME_TEXT_EXTRACTION.MAX_BYTES + 1)),
        }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('VALIDATION');
      expect(deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });

    it('throws SERVICE_UNAVAILABLE when the file is missing from storage', async () => {
      const deps = makeDeps({
        storageProvider: makeStorageProvider({ getObject: vi.fn().mockResolvedValue(null) }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('SERVICE_UNAVAILABLE');
    });

    it('gives up on extraction that never finishes', async () => {
      vi.useFakeTimers();
      try {
        const deps = makeDeps({
          documentTextExtractor: makeDocumentTextExtractor({
            extract: vi.fn().mockReturnValue(new Promise(() => {})),
          }),
        });
        const pending = run(deps, upload).catch((e) => e);
        await vi.advanceTimersByTimeAsync(RESUME_TEXT_EXTRACTION.EXTRACT_TIMEOUT_MS + 1);
        expect(codeOf(await pending)).toBe('SERVICE_UNAVAILABLE');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
