import { describe, it, expect, vi } from 'vitest';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { GenerateTalkingPointsUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateTalkingPointsUseCase.js';
import {
  AI_PROMPT_INPUT,
  INTERVIEW_QUESTION_LIMITS,
  MOCK_QUESTION_GENERATION,
} from '#src/use-cases/constants.js';
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

const reply = (points: { point: string; source: string }[]): string => JSON.stringify({ points });

const ACME_POINT = { point: 'Mention the Postgres replica migration', source: 'Engineer at Acme' };

interface Options {
  response?: string;
  ownerId?: string;
  question?: ReturnType<typeof makeMockInterviewQuestion> | null;
  workExperiences?: ReturnType<typeof makeWorkExperience>[];
  extractDocument?: IExtractDocumentTextUseCase['execute'];
  hasKey?: boolean;
  allowed?: boolean;
  truncated?: boolean;
}

function makeUseCase(options: Options = {}) {
  const llmProvider = makeLLMProvider(options.response ?? reply([ACME_POINT]));
  if (options.truncated) {
    llmProvider.complete = vi
      .fn()
      .mockResolvedValue({ content: '{"points": [', usage: null, truncated: true });
  }
  const llmProviderFactory = makeLLMProviderFactory({
    forUser: vi.fn().mockResolvedValue(options.hasKey === false ? null : llmProvider),
  });
  const question = options.question === undefined ? makeMockInterviewQuestion() : options.question;
  const mockInterviewQuestionRepository = makeMockInterviewQuestionRepository({
    findById: vi.fn().mockResolvedValue(question),
    update: vi.fn().mockImplementation((_id: string, data: { talkingPoints?: string | null }) =>
      Promise.resolve({
        ...makeMockInterviewQuestion(),
        talkingPoints: data.talkingPoints ?? null,
        talkingPointsGeneratedAt: new Date('2024-06-01'),
      }),
    ),
  });
  const useCase = new GenerateTalkingPointsUseCase({
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
    mockInterviewQuestionRepository,
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    companyBriefingRepository: makeCompanyBriefingRepository({
      findByApplicationId: vi.fn().mockResolvedValue(null),
    }),
    workExperienceRepository: makeWorkExperienceRepository({
      findAllByUserId: vi.fn().mockResolvedValue(options.workExperiences ?? []),
    }),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    extractDocumentTextUseCase: makeExtractDocumentTextUseCase({
      execute: options.extractDocument ?? vi.fn().mockResolvedValue({ text: '' }),
    }),
    generateMockTalkingPointsRateLimiter: makeRateLimiter({
      consume: vi.fn().mockResolvedValue(options.allowed ?? true),
    }),
  });
  return { useCase, llmProvider, llmProviderFactory, mockInterviewQuestionRepository };
}

const ACME = [makeWorkExperience({ company: 'Acme', title: 'Engineer' })];
const input = { userId: 'user-1', questionId: 'mock-question-1' };

describe('GenerateTalkingPointsUseCase', () => {
  it('saves one bullet per point, each with the entry it came from', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ workExperiences: ACME });

    const result = await useCase.execute(input);

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith('mock-question-1', {
      talkingPoints: '- Mention the Postgres replica migration (Engineer at Acme)',
    });
    expect(result).toMatchObject({
      nothingRelevant: false,
      usedProfile: true,
      usedDocument: false,
      question: { talkingPoints: '- Mention the Postgres replica migration (Engineer at Acme)' },
    });
  });

  it('returns the points without saving when asked not to (chat and MCP)', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({ workExperiences: ACME });

    const result = await useCase.execute({ ...input, save: false });

    expect(mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      nothingRelevant: false,
      talkingPoints: '- Mention the Postgres replica migration (Engineer at Acme)',
      question: { talkingPoints: null },
    });
  });

  it('uses the profile by default, fenced as untrusted data', async () => {
    const { useCase, llmProvider } = makeUseCase({ workExperiences: ACME });

    await useCase.execute(input);

    const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Acme');
    expect(user).toContain('Walk me through a system you designed');
    // job description, the question and the profile
    expect(user.match(/<untrusted_external_content>/g)).toHaveLength(3);
  });

  it('caps a large profile before it reaches the model', async () => {
    const { useCase, llmProvider } = makeUseCase({
      workExperiences: Array.from({ length: 200 }, (_, i) =>
        makeWorkExperience({ id: `we-${i}`, company: `Company${i}` }),
      ),
    });

    await useCase.execute(input);

    const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).not.toContain('Company199');
    expect(user.split('Candidate profile')[1]!.length).toBeLessThan(
      AI_PROMPT_INPUT.MOCK_INTERVIEW_PROFILE_MAX_CHARS + 500,
    );
  });

  it('caps a long document', async () => {
    const extractDocument = vi.fn().mockResolvedValue({
      text: `start ${'x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_RESUME_MAX_CHARS)} END_MARKER`,
    });
    const { useCase, llmProvider } = makeUseCase({ extractDocument });

    const result = await useCase.execute({ ...input, useProfile: false, documentId: 'doc-1' });

    const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    expect(messages.find((m) => m.role === 'user')!.content).not.toContain('END_MARKER');
    expect(result).toMatchObject({ usedProfile: false, usedDocument: true });
  });

  it('can use a document alongside the profile', async () => {
    const extractDocument = vi.fn().mockResolvedValue({ text: 'Ran the data team.' });
    const { useCase, llmProvider } = makeUseCase({ workExperiences: ACME, extractDocument });

    const result = await useCase.execute({ ...input, documentId: 'doc-1' });

    const [messages] = (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Acme');
    expect(user).toContain('Ran the data team.');
    expect(result).toMatchObject({ usedProfile: true, usedDocument: true });
  });

  it('says nothing is relevant, without calling the model, when there is no background', async () => {
    const { useCase, llmProvider, mockInterviewQuestionRepository } = makeUseCase();

    const result = await useCase.execute(input);

    expect(result).toMatchObject({
      nothingRelevant: true,
      usedProfile: false,
      usedDocument: false,
    });
    expect(llmProvider.complete).not.toHaveBeenCalled();
    expect(mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('says nothing is relevant, and saves nothing, when the model finds no match', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({
      workExperiences: ACME,
      response: reply([]),
    });

    const result = await useCase.execute(input);

    expect(result.nothingRelevant).toBe(true);
    expect(result.question.talkingPoints).toBeNull();
    expect(mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('drops a point that cites no source, since it is not tied to real experience', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({
      workExperiences: ACME,
      response: reply([{ point: 'Claim a Kubernetes migration', source: '  ' }, ACME_POINT]),
    });

    await useCase.execute(input);

    expect(mockInterviewQuestionRepository.update).toHaveBeenCalledWith('mock-question-1', {
      talkingPoints: '- Mention the Postgres replica migration (Engineer at Acme)',
    });
  });

  it('is nothing relevant when every point lacks a source', async () => {
    const { useCase } = makeUseCase({
      workExperiences: ACME,
      response: reply([{ point: 'Invented', source: '' }]),
    });

    expect((await useCase.execute(input)).nothingRelevant).toBe(true);
  });

  it('trims bullets, removes repeats, and keeps at most the maximum', async () => {
    const many = Array.from(
      { length: MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_COUNT + 3 },
      (_, i) => ({
        point: `- Point ${i}`,
        source: 'Engineer at Acme',
      }),
    );
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({
      workExperiences: ACME,
      response: reply([many[0]!, { ...many[0]!, point: 'point 0' }, ...many.slice(1)]),
    });

    await useCase.execute(input);

    const saved = vi.mocked(mockInterviewQuestionRepository.update).mock.calls[0]![1]
      .talkingPoints!;
    const lines = saved.split('\n');
    expect(lines).toHaveLength(MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_COUNT);
    expect(lines[0]).toBe('- Point 0 (Engineer at Acme)');
  });

  it('caps each point and its source', async () => {
    const { useCase, mockInterviewQuestionRepository } = makeUseCase({
      workExperiences: ACME,
      response: reply([
        {
          point: 'p'.repeat(INTERVIEW_QUESTION_LIMITS.TALKING_POINT_MAX_CHARS + 50),
          source: 's'.repeat(INTERVIEW_QUESTION_LIMITS.TALKING_POINT_SOURCE_MAX_CHARS + 50),
        },
      ]),
    });

    await useCase.execute(input);

    const saved = vi.mocked(mockInterviewQuestionRepository.update).mock.calls[0]![1]
      .talkingPoints!;
    expect(saved).toBe(
      `- ${'p'.repeat(INTERVIEW_QUESTION_LIMITS.TALKING_POINT_MAX_CHARS)} (${'s'.repeat(INTERVIEW_QUESTION_LIMITS.TALKING_POINT_SOURCE_MAX_CHARS)})`,
    );
  });

  it('refuses a document that is not the user’s before calling the model', async () => {
    const extractDocument = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Not authorized'), { code: 'FORBIDDEN' }));
    const { useCase, llmProvider } = makeUseCase({ workExperiences: ACME, extractDocument });

    const err = await useCase.execute({ ...input, documentId: 'doc-x' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('FORBIDDEN');
    expect(llmProvider.complete).not.toHaveBeenCalled();
  });

  it('throws AI_RESPONSE_INVALID for malformed or cut-off output and saves nothing', async () => {
    const malformed = makeUseCase({ workExperiences: ACME, response: 'not json at all' });
    const cut = makeUseCase({ workExperiences: ACME, truncated: true });

    const a = await malformed.useCase.execute(input).catch((e) => e);
    const b = await cut.useCase.execute(input).catch((e) => e);

    expect((a as { code: string }).code).toBe('AI_RESPONSE_INVALID');
    expect((b as { code: string }).code).toBe('AI_RESPONSE_INVALID');
    expect(malformed.mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
    expect(cut.mockInterviewQuestionRepository.update).not.toHaveBeenCalled();
  });

  it('throws AI_NOT_CONFIGURED without an API key and RATE_LIMITED over the limit', async () => {
    const noKey = await makeUseCase({ hasKey: false })
      .useCase.execute(input)
      .catch((e) => e);
    const limited = makeUseCase({ allowed: false });
    const err = await limited.useCase.execute(input).catch((e) => e);

    expect((noKey as { code: string }).code).toBe('AI_NOT_CONFIGURED');
    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(limited.llmProviderFactory.forUser).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown question and FORBIDDEN for another user’s', async () => {
    const missing = await makeUseCase({ question: null })
      .useCase.execute({ userId: 'user-1', questionId: 'x' })
      .catch((e) => e);
    const foreign = await makeUseCase({ ownerId: 'other-user' })
      .useCase.execute(input)
      .catch((e) => e);

    expect((missing as { code: string }).code).toBe('NOT_FOUND');
    expect((foreign as { code: string }).code).toBe('FORBIDDEN');
  });
});
