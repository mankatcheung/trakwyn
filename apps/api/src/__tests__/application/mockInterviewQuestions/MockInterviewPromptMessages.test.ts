import { describe, it, expect, vi } from 'vitest';
import { GenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockAnswerUseCase.js';
import { GenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockQuestionsUseCase.js';
import { GenerateTalkingPointsUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateTalkingPointsUseCase.js';
import { makeExtractDocumentTextUseCase } from '#src/__tests__/helpers/mocks/documents.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeCompanyBriefingRepository,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

/**
 * The exact messages the three mock interview use cases send (JEF-505),
 * recorded before the prompts moved into `use-cases/prompts/`.
 */
function makeDeps(llmProvider: ReturnType<typeof makeLLMProvider>, customAiPrompt: string | null) {
  return {
    llmProviderFactory: makeLLMProviderFactory({
      forUser: vi.fn().mockResolvedValue(llmProvider),
    }),
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(makeApplication({ description: 'Build APIs.' })),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    mockInterviewQuestionRepository: makeMockInterviewQuestionRepository({
      findById: vi.fn().mockResolvedValue(makeMockInterviewQuestion()),
    }),
    userRepository: makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ customAiPrompt })),
    }),
    companyBriefingRepository: makeCompanyBriefingRepository({
      findByApplicationId: vi.fn().mockResolvedValue({
        id: 'b1',
        applicationId: 'app-1',
        content: 'Acme is a payments company.',
        generatedAt: new Date('2026-01-01'),
      }),
    }),
    workExperienceRepository: makeWorkExperienceRepository({
      findAllByUserId: vi.fn().mockResolvedValue([
        makeWorkExperience({
          company: 'Acme',
          title: 'Engineer',
          // Noon UTC, 1 January: prints the same in any locale and timezone,
          // since the profile is formatted with the machine's.
          startDate: new Date('2020-01-01T12:00:00Z'),
          endDate: new Date('2023-01-01T12:00:00Z'),
        }),
      ]),
    }),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    extractDocumentTextUseCase: makeExtractDocumentTextUseCase({
      execute: vi.fn().mockResolvedValue({ text: '' }),
    }),
    generateMockQuestionsRateLimiter: makeRateLimiter(),
    generateMockAnswerRateLimiter: makeRateLimiter(),
    generateMockTalkingPointsRateLimiter: makeRateLimiter(),
  };
}

const callOf = (provider: ReturnType<typeof makeLLMProvider>) =>
  (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0];

describe('mock interview prompt messages', () => {
  it.each([null, 'Keep it short.'])('questions (custom prompt: %s)', async (customAiPrompt) => {
    const provider = makeLLMProvider(JSON.stringify({ questions: ['Q1?'] }));
    await new GenerateMockQuestionsUseCase(makeDeps(provider, customAiPrompt) as never).execute({
      userId: 'user-1',
      roundId: 'round-1',
      prompt: 'Focus on system design',
      useProfile: true,
    });
    const [messages, maxTokens, , options] = callOf(provider);
    expect({ messages, maxTokens, options }).toMatchSnapshot();
  });

  it.each([null, 'Keep it short.'])('answer (custom prompt: %s)', async (customAiPrompt) => {
    const provider = makeLLMProvider('I would start with the data.');
    await new GenerateMockAnswerUseCase(makeDeps(provider, customAiPrompt) as never).execute({
      userId: 'user-1',
      questionId: 'mock-question-1',
      prompt: 'Keep it short',
      useProfile: true,
    });
    const [messages, maxTokens, , options] = callOf(provider);
    expect({ messages, maxTokens, options }).toMatchSnapshot();
  });

  it.each([null, 'Keep it short.'])(
    'talking points (custom prompt: %s)',
    async (customAiPrompt) => {
      const provider = makeLLMProvider(
        JSON.stringify({
          points: [{ point: 'Mention the migration', source: 'Engineer at Acme' }],
        }),
      );
      await new GenerateTalkingPointsUseCase(makeDeps(provider, customAiPrompt) as never).execute({
        userId: 'user-1',
        questionId: 'mock-question-1',
        save: false,
      });
      const [messages, maxTokens, , options] = callOf(provider);
      expect({ messages, maxTokens, options }).toMatchSnapshot();
    },
  );
});
