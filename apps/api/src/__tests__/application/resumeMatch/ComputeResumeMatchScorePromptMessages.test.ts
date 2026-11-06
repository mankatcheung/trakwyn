import { describe, it, expect, vi } from 'vitest';
import { ComputeResumeMatchScoreUseCase } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
  makeDocumentTextExtractor,
  makeResumeMatchRepository,
  makeStorageProvider,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';

/** The exact messages the resume match use case sends (JEF-505). */
describe('ComputeResumeMatchScoreUseCase prompt messages', () => {
  it('sends the ATS screener prompt', async () => {
    const llmProvider = makeLLMProvider(JSON.stringify({ matchPercentage: 80 }));
    await new ComputeResumeMatchScoreUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi
          .fn()
          .mockResolvedValue(makeApplication({ description: 'We need a TS engineer' })),
      }),
      documentRepository: makeDocumentRepository(),
      documentDraftRepository: makeDocumentDraftRepository({
        findById: vi.fn().mockResolvedValue(
          makeDocumentDraft({
            id: 'draft-1',
            type: 'resume',
            plainText: 'TypeScript expert',
          }),
        ),
      }),
      resumeMatchRepository: makeResumeMatchRepository(),
      storageProvider: makeStorageProvider(),
      documentTextExtractor: makeDocumentTextExtractor(),
      llmProviderFactory: makeLLMProviderFactory({
        forUser: vi.fn().mockResolvedValue(llmProvider),
      }),
      computeResumeMatchScoreRateLimiter: makeRateLimiter(),
      generateId: () => 'match-1',
      now: () => new Date('2026-10-12T12:00:00Z'),
    } as never).execute({
      applicationId: 'app-1',
      userId: 'user-1',
      documentDraftId: 'draft-1',
    });

    const [messages, , , options] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(messages).toMatchSnapshot();
    expect(options).toMatchSnapshot();
  });
});
