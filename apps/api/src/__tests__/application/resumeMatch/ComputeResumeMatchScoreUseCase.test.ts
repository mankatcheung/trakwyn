import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComputeResumeMatchScoreUseCase } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import { RESUME_TEXT_EXTRACTION } from '#src/use-cases/constants.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import {
  makeDocument,
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
  makeDocumentTextExtractor,
  makeResumeMatchRepository,
  makeStorageProvider,
  makeStoredObject,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';

const MATCH_RESPONSE = JSON.stringify({
  matchPercentage: 82,
  matchedKeywords: ['TypeScript', 'GraphQL'],
  missingKeywords: ['Kubernetes'],
  summary: 'Strong overlap on core skills; missing infra experience.',
});

const NOW = new Date('2026-10-12T12:00:00Z');
const DRAFT_TEXT = 'TypeScript expert';

const resumeDraft = (overrides = {}) =>
  makeDocumentDraft({ id: 'draft-1', type: 'resume', plainText: DRAFT_TEXT, ...overrides });

const uploadedResume = (overrides = {}) =>
  makeDocument({ id: 'doc-1', documentType: 'resume', ...overrides });

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeApplication({ description: 'We need a TS engineer' })),
    }),
    documentRepository: makeDocumentRepository({
      findById: vi.fn().mockResolvedValue(uploadedResume()),
    }),
    documentDraftRepository: makeDocumentDraftRepository({
      findById: vi.fn().mockResolvedValue(resumeDraft()),
    }),
    resumeMatchRepository: makeResumeMatchRepository(),
    storageProvider: makeStorageProvider(),
    documentTextExtractor: makeDocumentTextExtractor(),
    llmProviderFactory: makeLLMProviderFactory({
      forUser: vi.fn().mockResolvedValue(makeLLMProvider(MATCH_RESPONSE)),
    }),
    computeResumeMatchScoreRateLimiter: makeRateLimiter(),
    generateId: () => 'match-1',
    now: () => NOW,
    ...overrides,
  };
}

const run = (deps: ReturnType<typeof makeDeps>, input: Record<string, unknown> = {}) =>
  new ComputeResumeMatchScoreUseCase(deps as never).execute({
    applicationId: 'app-1',
    userId: 'user-1',
    documentDraftId: 'draft-1',
    ...input,
  });

const codeOf = (err: unknown) => (err as { code: string }).code;

describe('ComputeResumeMatchScoreUseCase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('guards', () => {
    it('throws NOT_FOUND when application is not found', async () => {
      const deps = makeDeps({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(null),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('NOT_FOUND');
    });

    it('throws FORBIDDEN when application belongs to a different user', async () => {
      const deps = makeDeps({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-2' })),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('FORBIDDEN');
    });

    it('throws AI_NOT_CONFIGURED when the user has no LLM API key set up', async () => {
      const deps = makeDeps({
        llmProviderFactory: makeLLMProviderFactory({ forUser: vi.fn().mockResolvedValue(null) }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('AI_NOT_CONFIGURED');
    });

    it('throws VALIDATION when there is no job description', async () => {
      const deps = makeDeps({
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(makeApplication({ description: null })),
        }),
      });
      const err = await run(deps).catch((e) => e);
      expect(codeOf(err)).toBe('VALIDATION');
      expect((err as Error).message).toMatch(/job description/);
    });

    it('throws RATE_LIMITED when the rate limiter rejects the request', async () => {
      const deps = makeDeps({
        computeResumeMatchScoreRateLimiter: makeRateLimiter({
          consume: vi.fn().mockResolvedValue(false),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('RATE_LIMITED');
    });

    it.each([
      ['neither a draft nor a document', { documentDraftId: null, documentId: null }],
      ['both a draft and a document', { documentDraftId: 'draft-1', documentId: 'doc-1' }],
    ])('throws VALIDATION when given %s', async (_label, input) => {
      const deps = makeDeps();
      expect(codeOf(await run(deps, input).catch((e) => e))).toBe('VALIDATION');
      expect(deps.llmProviderFactory.forUser).not.toHaveBeenCalled();
    });
  });

  describe('a resume draft', () => {
    it('scores the draft text, saves the match and returns it as not stale', async () => {
      const deps = makeDeps();

      const result = await run(deps);

      expect(result).toMatchObject({
        id: 'match-1',
        applicationId: 'app-1',
        documentDraftId: 'draft-1',
        documentId: null,
        score: 82,
        label: 'Good match',
        matchedKeywords: ['TypeScript', 'GraphQL'],
        missingKeywords: ['Kubernetes'],
        summary: 'Strong overlap on core skills; missing infra experience.',
        generatedAt: NOW,
        isStale: false,
      });
      expect(deps.resumeMatchRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          documentDraftId: 'draft-1',
          documentId: null,
          resumeTextHash: hashResumeText(DRAFT_TEXT),
        }),
      );
    });

    it('does not read a file from storage', async () => {
      const deps = makeDeps();
      await run(deps);
      expect(deps.storageProvider.getObject).not.toHaveBeenCalled();
    });

    it.each([
      ['does not exist', null],
      ['belongs to another application', resumeDraft({ applicationId: 'app-2' })],
      ['is a cover letter', resumeDraft({ type: 'cover_letter' })],
    ])('throws NOT_FOUND when the draft %s', async (_label, draft) => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(draft),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('NOT_FOUND');
      expect(deps.resumeMatchRepository.upsert).not.toHaveBeenCalled();
    });

    it('throws VALIDATION when the draft is empty', async () => {
      const deps = makeDeps({
        documentDraftRepository: makeDocumentDraftRepository({
          findById: vi.fn().mockResolvedValue(resumeDraft({ plainText: '   ' })),
        }),
      });
      expect(codeOf(await run(deps).catch((e) => e))).toBe('VALIDATION');
    });

    it('calls the LLM with the job description and resume text, fencing only the job description', async () => {
      const complete = vi.fn().mockResolvedValue({ content: MATCH_RESPONSE });
      const deps = makeDeps({
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue({ complete }),
        }),
      });

      await run(deps);

      const prompt = complete.mock.calls[0][0][1].content as string;
      expect(prompt).toContain('We need a TS engineer');
      expect(prompt).toContain(`Resume:\n${DRAFT_TEXT}`);
      expect(prompt).toMatch(/<untrusted/i);
      expect(prompt.split('Resume:')[1]).not.toMatch(/<untrusted/i);
    });
  });

  describe('an uploaded resume', () => {
    const upload = { documentDraftId: null, documentId: 'doc-1' };

    it('extracts the file text, saves the match against the document', async () => {
      const deps = makeDeps();

      const result = await run(deps, upload);

      expect(result).toMatchObject({ documentDraftId: null, documentId: 'doc-1', isStale: false });
      expect(deps.resumeMatchRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          resumeTextHash: hashResumeText('extracted resume text'),
        }),
      );
    });

    it.each([
      ['does not exist', null],
      ['belongs to another application', uploadedResume({ applicationId: 'app-2' })],
      ['is not a resume', uploadedResume({ documentType: 'other' })],
    ])('throws NOT_FOUND when the document %s', async (_label, doc) => {
      const deps = makeDeps({
        documentRepository: makeDocumentRepository({ findById: vi.fn().mockResolvedValue(doc) }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('NOT_FOUND');
    });

    it('throws VALIDATION when the extracted resume text is blank', async () => {
      const deps = makeDeps({
        documentTextExtractor: makeDocumentTextExtractor({
          extract: vi.fn().mockResolvedValue('   '),
        }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('VALIDATION');
    });

    it('reads the uploaded file from storage by its key, not through a URL', async () => {
      const deps = makeDeps();
      await run(deps, upload);

      expect(deps.storageProvider.getObject).toHaveBeenCalledWith(
        'users/user-1/applications/app-1/resume.pdf',
      );
      expect(deps.storageProvider.getSignedUrl).not.toHaveBeenCalled();
      expect(deps.documentTextExtractor.extract).toHaveBeenCalledWith(
        Buffer.from('resume bytes'),
        'application/pdf',
      );
    });

    it('refuses a file whose declared size exceeds the upload cap before reading it (S9)', async () => {
      const oversized = makeStoredObject('x', RESUME_TEXT_EXTRACTION.MAX_BYTES + 1);
      const deps = makeDeps({
        storageProvider: makeStorageProvider({ getObject: vi.fn().mockResolvedValue(oversized) }),
      });

      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('VALIDATION');
      expect(oversized.stream.destroyed).toBe(true);
      expect(deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });

    it('refuses a body larger than the cap even when no size was declared', async () => {
      const oversized = makeStoredObject(Buffer.alloc(RESUME_TEXT_EXTRACTION.MAX_BYTES + 1), null);
      const deps = makeDeps({
        storageProvider: makeStorageProvider({ getObject: vi.fn().mockResolvedValue(oversized) }),
      });

      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('VALIDATION');
      expect(deps.documentTextExtractor.extract).not.toHaveBeenCalled();
    });

    it('gives up on a storage read that never finishes', async () => {
      vi.useFakeTimers();
      try {
        const deps = makeDeps({
          storageProvider: makeStorageProvider({
            getObject: vi.fn().mockReturnValue(new Promise(() => {})),
          }),
        });

        const pending = run(deps, upload).catch((e) => e);
        await vi.advanceTimersByTimeAsync(RESUME_TEXT_EXTRACTION.FETCH_TIMEOUT_MS + 1);

        expect(codeOf(await pending)).toBe('SERVICE_UNAVAILABLE');
      } finally {
        vi.useRealTimers();
      }
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

    it('throws SERVICE_UNAVAILABLE when the file is missing from storage', async () => {
      const deps = makeDeps({
        storageProvider: makeStorageProvider({ getObject: vi.fn().mockResolvedValue(null) }),
      });
      expect(codeOf(await run(deps, upload).catch((e) => e))).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('parsing the LLM response', () => {
    const withLlm = (content: string) =>
      makeDeps({
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue(makeLLMProvider(content)),
        }),
      });

    it('clamps score to 0-100', async () => {
      const result = await run(withLlm(JSON.stringify({ matchPercentage: 150 })));
      expect(result.score).toBe(100);
    });

    it.each([
      [95, 'Excellent match'],
      [75, 'Good match'],
      [45, 'Some overlap'],
      [10, 'Needs work'],
    ])('labels a score of %i as "%s"', async (matchPercentage, label) => {
      const result = await run(withLlm(JSON.stringify({ matchPercentage })));
      expect(result.label).toBe(label);
    });

    it('throws AI_RESPONSE_INVALID when the LLM responds with invalid JSON', async () => {
      const deps = withLlm('not json');
      expect(codeOf(await run(deps).catch((e) => e))).toBe('AI_RESPONSE_INVALID');
      expect(deps.resumeMatchRepository.upsert).not.toHaveBeenCalled();
    });

    it('throws AI_RESPONSE_INVALID when matchedKeywords is not an array (JEF-108)', async () => {
      const deps = withLlm(JSON.stringify({ matchPercentage: 50, matchedKeywords: 'TypeScript' }));
      expect(codeOf(await run(deps).catch((e) => e))).toBe('AI_RESPONSE_INVALID');
    });

    it('strips markdown code fences from the LLM response before parsing', async () => {
      const result = await run(withLlm('```json\n' + MATCH_RESPONSE + '\n```'));
      expect(result.score).toBe(82);
    });
  });
});
