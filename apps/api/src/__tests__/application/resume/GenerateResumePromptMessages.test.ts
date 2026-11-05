import { describe, it, expect, vi } from 'vitest';
import { GenerateResumeUseCase } from '#src/use-cases/resume/GenerateResumeUseCase.js';
import { makeDocumentDraftRepository } from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeLLMProvider, makeLLMProviderFactory } from '#src/__tests__/helpers/mocks/llm.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import {
  makeEducation,
  makeEducationRepository,
  makeSkill,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

/** The exact messages the resume use case sends (JEF-505). */
describe('GenerateResumeUseCase prompt messages', () => {
  const VALID = JSON.stringify({
    summary: 'Engineer.',
    experience: [{ company: 'Acme', title: 'Engineer', bullets: ['Built widgets'] }],
    education: [{ institution: 'State University' }],
    skills: [{ category: 'Languages', items: ['TypeScript'] }],
  });

  it.each([null, 'Keep it under one page.'])(
    'sends the resume writer prompt (custom prompt: %s)',
    async (customAiPrompt) => {
      const llmProvider = makeLLMProvider(VALID);
      await new GenerateResumeUseCase({
        llmProviderFactory: makeLLMProviderFactory({
          forUser: vi.fn().mockResolvedValue(llmProvider),
        }),
        applicationRepository: makeApplicationRepository({
          findById: vi.fn().mockResolvedValue(
            makeApplication({
              userId: 'user-1',
              company: 'Initech',
              location: 'Remote',
              description: 'Build APIs.',
            }),
          ),
        }),
        userRepository: makeUserRepository({
          findById: vi.fn().mockResolvedValue(makeUser({ customAiPrompt })),
        }),
        workExperienceRepository: makeWorkExperienceRepository({
          findAllByUserId: vi
            .fn()
            .mockResolvedValue([makeWorkExperience({ company: 'Acme', title: 'Engineer' })]),
        }),
        educationRepository: makeEducationRepository({
          findAllByUserId: vi
            .fn()
            .mockResolvedValue([makeEducation({ institution: 'State University' })]),
        }),
        skillRepository: makeSkillRepository({
          findAllByUserId: vi
            .fn()
            .mockResolvedValue([makeSkill({ name: 'TypeScript', category: 'Languages' })]),
        }),
        generateResumeRateLimiter: makeRateLimiter(),
        noteRepository: makeNoteRepository({
          findAllByApplicationId: vi.fn().mockResolvedValue([makeNote()]),
        }),
        documentDraftRepository: makeDocumentDraftRepository(),
      } as never).execute({ applicationId: 'app-1', userId: 'user-1' });

      const [messages, maxTokens, , options] = (llmProvider.complete as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect({ messages, maxTokens, options }).toMatchSnapshot();
    },
  );
});
