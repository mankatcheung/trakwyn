import { describe, it, expect, vi } from 'vitest';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { GenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockAnswerUseCase.js';
import { AI_PROMPT_INPUT, INTERVIEW_QUESTION_LIMITS } from '#src/use-cases/constants.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
  makeMockInterviewQuestion,
  makeMockInterviewQuestionRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import {
  makeCompanyBriefingRepository,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeExtractDocumentTextUseCase } from '#src/__tests__/helpers/mocks/documents.js';

interface Options {
  response?: string;
  ownerId?: string;
  question?: ReturnType<typeof makeMockInterviewQuestion> | null;
  briefing?: string | null;
  hasKey?: boolean;
  allowed?: boolean;
  truncated?: boolean;
  workExperiences?: ReturnType<typeof makeWorkExperience>[];
  extractDocument?: IExtractDocumentTextUseCase['execute'];
}

function makeUseCase(options: Options = {}) {
  const llmProvider = makeLLMProvider(options.response ?? '  I would start with the data.  ');
  if (options.truncated) {
    llmProvider.complete = vi
      .fn()
      .mockResolvedValue({ content: 'cut', usage: null, truncated: true });
  }
  const llmProviderFactory = makeLLMProviderFactory({
    forUser: vi.fn().mockResolvedValue(options.hasKey === false ? null : llmProvider),
  });
  const useCase = new GenerateMockAnswerUseCase({
    llmProviderFactory,
    applicationRepository: makeApplicationRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          makeApplication({ userId: options.ownerId ?? 'user-1', description: 'Build APIs.' }),
        ),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi.fn().mockResolvedValue(makeInterviewRound()),
    }),
    mockInterviewQuestionRepository: makeMockInterviewQuestionRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          options.question === undefined ? makeMockInterviewQuestion() : options.question,
        ),
    }),
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    companyBriefingRepository: makeCompanyBriefingRepository({
      findByApplicationId: vi.fn().mockResolvedValue(
        options.briefing
          ? {
              id: 'b1',
              applicationId: 'app-1',
              content: options.briefing,
              generatedAt: new Date(),
            }
          : null,
      ),
    }),
    workExperienceRepository: makeWorkExperienceRepository({
      findAllByUserId: vi.fn().mockResolvedValue(options.workExperiences ?? []),
    }),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    extractDocumentTextUseCase: makeExtractDocumentTextUseCase({
      execute: options.extractDocument ?? vi.fn().mockResolvedValue({ text: '' }),
    }),
    generateMockAnswerRateLimiter: makeRateLimiter({
      consume: vi.fn().mockResolvedValue(options.allowed ?? true),
    }),
  });
  return { useCase, llmProvider, llmProviderFactory };
}

describe('GenerateMockAnswerUseCase', () => {
  it('returns the trimmed draft and does not save it', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' });

    expect(result.answer).toBe('I would start with the data.');
  });

  it('reports what the model had to work from', async () => {
    const result = await makeUseCase({ briefing: 'Acme is a payments company.' }).useCase.execute({
      userId: 'user-1',
      questionId: 'mock-question-1',
    });

    expect(result).toMatchObject({ usedJobDescription: true, usedBriefing: true });
  });

  it('sends the question, job description and briefing, fenced as untrusted data', async () => {
    const { useCase, llmProvider } = makeUseCase({ briefing: 'Acme is a payments company.' });

    await useCase.execute({
      userId: 'user-1',
      questionId: 'mock-question-1',
      prompt: 'Keep it short',
    });

    const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Walk me through a system you designed');
    expect(user).toContain('Build APIs.');
    expect(user).toContain('Acme is a payments company.');
    expect(user).toContain('Keep it short');
    expect(user.match(/<untrusted_external_content>/g)).toHaveLength(3);
  });

  describe('candidate background (JEF-394)', () => {
    const userMessage = (llmProvider: { complete: unknown }): string => {
      const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
        Array<{ role: string; content: string }>,
      ];
      return messages.find((m) => m.role === 'user')!.content;
    };

    it('does not read or send the profile unless asked', async () => {
      const { useCase, llmProvider } = makeUseCase({
        workExperiences: [makeWorkExperience({ company: 'Initech' })],
      });

      const result = await useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' });

      expect(userMessage(llmProvider)).not.toContain('Initech');
      expect(result).toMatchObject({ usedProfile: false, usedDocument: false });
    });

    it('sends the profile as a second fenced block when asked', async () => {
      const { useCase, llmProvider } = makeUseCase({
        workExperiences: [makeWorkExperience({ company: 'Initech' })],
      });

      const result = await useCase.execute({
        userId: 'user-1',
        questionId: 'mock-question-1',
        useProfile: true,
      });

      const user = userMessage(llmProvider);
      expect(user).toContain('Initech');
      expect(user.match(/<untrusted_external_content>/g)).toHaveLength(3);
      expect(result.usedProfile).toBe(true);
    });

    it('caps a large profile', async () => {
      const { useCase, llmProvider } = makeUseCase({
        workExperiences: Array.from({ length: 200 }, (_, i) =>
          makeWorkExperience({ id: `we-${i}`, company: `Company${i}` }),
        ),
      });

      await useCase.execute({ userId: 'user-1', questionId: 'mock-question-1', useProfile: true });

      const block = userMessage(llmProvider).split('Candidate profile')[1]!;
      expect(block.length).toBeLessThan(AI_PROMPT_INPUT.MOCK_INTERVIEW_PROFILE_MAX_CHARS + 1000);
      expect(block).not.toContain('Company199');
    });

    it('sends the text of a chosen document and reports it', async () => {
      const extractDocument = vi.fn().mockResolvedValue({ text: 'Led the Postgres migration.' });
      const { useCase, llmProvider } = makeUseCase({ extractDocument });

      const result = await useCase.execute({
        userId: 'user-1',
        questionId: 'mock-question-1',
        documentId: 'doc-1',
      });

      expect(extractDocument).toHaveBeenCalledWith({ userId: 'user-1', documentId: 'doc-1' });
      expect(userMessage(llmProvider)).toContain('Led the Postgres migration.');
      expect(result).toMatchObject({ usedProfile: false, usedDocument: true });
    });

    it('refuses a document that is not the user’s before calling the model', async () => {
      const extractDocument = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Not authorized'), { code: 'FORBIDDEN' }));
      const { useCase, llmProvider } = makeUseCase({ extractDocument });

      const err = await useCase
        .execute({ userId: 'user-1', questionId: 'mock-question-1', documentId: 'doc-x' })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('FORBIDDEN');
      expect(llmProvider.complete).not.toHaveBeenCalled();
    });

    it('reports nothing used when the profile is empty', async () => {
      const result = await makeUseCase().useCase.execute({
        userId: 'user-1',
        questionId: 'mock-question-1',
        useProfile: true,
      });

      expect(result.usedProfile).toBe(false);
    });
  });

  it('caps the answer at the storable length', async () => {
    const long = 'a'.repeat(INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS + 200);
    const { useCase } = makeUseCase({ response: long });

    const result = await useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' });

    expect(result.answer).toHaveLength(INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS);
  });

  it('rejects an over-long prompt', async () => {
    const { useCase, llmProvider } = makeUseCase();

    const err = await useCase
      .execute({
        userId: 'user-1',
        questionId: 'mock-question-1',
        prompt: 'x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS + 1),
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(llmProvider.complete).not.toHaveBeenCalled();
  });

  it('throws AI_RESPONSE_INVALID for an empty or cut-off reply', async () => {
    const empty = await makeUseCase({ response: '   ' })
      .useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' })
      .catch((e) => e);
    const cut = await makeUseCase({ truncated: true })
      .useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' })
      .catch((e) => e);

    expect((empty as { code: string }).code).toBe('AI_RESPONSE_INVALID');
    expect((cut as { code: string }).code).toBe('AI_RESPONSE_INVALID');
  });

  it('throws AI_NOT_CONFIGURED without an API key and RATE_LIMITED over the limit', async () => {
    const noKey = await makeUseCase({ hasKey: false })
      .useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' })
      .catch((e) => e);
    const limited = makeUseCase({ allowed: false });
    const err = await limited.useCase
      .execute({ userId: 'user-1', questionId: 'mock-question-1' })
      .catch((e) => e);

    expect((noKey as { code: string }).code).toBe('AI_NOT_CONFIGURED');
    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(limited.llmProviderFactory.forUser).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown question and FORBIDDEN for another user’s', async () => {
    const missing = await makeUseCase({ question: null })
      .useCase.execute({ userId: 'user-1', questionId: 'x' })
      .catch((e) => e);
    const foreign = await makeUseCase({ ownerId: 'other-user' })
      .useCase.execute({ userId: 'user-1', questionId: 'mock-question-1' })
      .catch((e) => e);

    expect((missing as { code: string }).code).toBe('NOT_FOUND');
    expect((foreign as { code: string }).code).toBe('FORBIDDEN');
  });
});
