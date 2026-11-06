import { describe, it, expect, vi } from 'vitest';
import { ParseCvUseCase } from '#src/use-cases/profile/ParseCvUseCase.js';
import { MIME_TYPE } from '#src/use-cases/constants.js';
import { makeDocumentTextExtractor } from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';

/** The exact messages the CV parser sends (JEF-505). */
describe('ParseCvUseCase prompt messages', () => {
  it('sends the CV parser prompt', async () => {
    const llmProvider = makeLLMProvider(
      JSON.stringify({ workExperiences: [], educations: [], skills: [] }),
    );
    await new ParseCvUseCase({
      llmProviderFactory: makeLLMProviderFactory({
        forUser: vi.fn().mockResolvedValue(llmProvider),
      }),
      documentTextExtractor: makeDocumentTextExtractor({
        extract: vi.fn().mockResolvedValue('Jane Doe — CV text'),
      }),
      workExperienceRepository: makeWorkExperienceRepository(),
      educationRepository: makeEducationRepository(),
      skillRepository: makeSkillRepository(),
      parseCvRateLimiter: makeRateLimiter(),
    }).execute({
      userId: 'user-1',
      buffer: Buffer.from('%PDF-1.7\nbody'),
      mimeType: MIME_TYPE.PDF,
    });

    const [messages, maxTokens, , options] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect({ messages, maxTokens, options }).toMatchSnapshot();
  });
});
