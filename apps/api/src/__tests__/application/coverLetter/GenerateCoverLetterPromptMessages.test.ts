import { describe, it, expect, vi } from 'vitest';
import { GenerateCoverLetterUseCase } from '#src/use-cases/coverLetter/GenerateCoverLetterUseCase.js';
import { makeDocumentDraftRepository } from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeCompanyBriefingRepository,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

/**
 * The exact messages the cover letter use case sends (JEF-505). The prompt
 * moved out of the use case into `use-cases/prompts/`; these snapshots were
 * recorded before the move and must not change with it.
 */
describe('GenerateCoverLetterUseCase prompt messages', () => {
  const sentMessages = async (customAiPrompt: string | null, resumeText: string | null) => {
    const llmProvider = makeLLMProvider('letter');
    await new GenerateCoverLetterUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi
          .fn()
          .mockResolvedValue(
            makeApplication({ description: 'We build great software.', location: 'Remote' }),
          ),
      }),
      llmProviderFactory: makeLLMProviderFactory({
        forUser: vi.fn().mockResolvedValue(llmProvider),
      }),
      workExperienceRepository: makeWorkExperienceRepository(),
      educationRepository: makeEducationRepository(),
      skillRepository: makeSkillRepository(),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ customAiPrompt })),
      }),
      generateCoverLetterRateLimiter: makeRateLimiter(),
      noteRepository: makeNoteRepository(),
      documentDraftRepository: makeDocumentDraftRepository(),
      companyBriefingRepository: makeCompanyBriefingRepository(),
    } as never).execute({ applicationId: 'app-1', userId: 'user-1', resumeText });
    return (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
  };

  it('without a custom prompt', async () => {
    expect(await sentMessages(null, 'Ten years of TypeScript.')).toMatchSnapshot();
  });

  it('with a custom prompt and no resume', async () => {
    expect(await sentMessages('Keep it under 150 words.', null)).toMatchSnapshot();
  });
});
