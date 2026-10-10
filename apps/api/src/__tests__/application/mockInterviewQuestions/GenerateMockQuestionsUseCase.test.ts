import { describe, it, expect, vi } from 'vitest';
import { GenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockQuestionsUseCase.js';
import { AI_PROMPT_INPUT, INTERVIEW_QUESTION_LIMITS } from '#src/use-cases/constants.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import {
  makeCompanyBriefingRepository,
  makeLLMProvider,
  makeLLMProviderFactory,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const reply = (questions: string[]): string => JSON.stringify({ questions });

interface Options {
  response?: string;
  ownerId?: string;
  round?: ReturnType<typeof makeInterviewRound> | null;
  description?: string | null;
  briefing?: string | null;
  hasKey?: boolean;
  allowed?: boolean;
  customAiPrompt?: string | null;
  truncated?: boolean;
}

function makeUseCase(options: Options = {}) {
  const llmProvider = makeLLMProvider(options.response ?? reply(['Q1?', 'Q2?']));
  if (options.truncated) {
    llmProvider.complete = vi
      .fn()
      .mockResolvedValue({ content: options.response ?? '{', usage: null, truncated: true });
  }
  const llmProviderFactory = makeLLMProviderFactory({
    forUser: vi.fn().mockResolvedValue(options.hasKey === false ? null : llmProvider),
  });
  const rateLimiter = makeRateLimiter({
    consume: vi.fn().mockResolvedValue(options.allowed ?? true),
  });
  const useCase = new GenerateMockQuestionsUseCase({
    llmProviderFactory,
    applicationRepository: makeApplicationRepository({
      findById: vi.fn().mockResolvedValue(
        makeApplication({
          userId: options.ownerId ?? 'user-1',
          description: options.description === undefined ? 'Build APIs.' : options.description,
        }),
      ),
    }),
    interviewRoundRepository: makeInterviewRoundRepository({
      findById: vi
        .fn()
        .mockResolvedValue(options.round === undefined ? makeInterviewRound() : options.round),
    }),
    userRepository: makeUserRepository({
      findById: vi
        .fn()
        .mockResolvedValue(makeUser({ customAiPrompt: options.customAiPrompt ?? null })),
    }),
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
    generateMockQuestionsRateLimiter: rateLimiter,
  });
  return { useCase, llmProvider, llmProviderFactory, rateLimiter };
}

const sentMessages = (llmProvider: { complete: unknown }) =>
  (llmProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{
    role: string;
    content: string;
  }>;

describe('GenerateMockQuestionsUseCase', () => {
  it('returns the model’s questions as suggestions without saving anything', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result.suggestions).toEqual(['Q1?', 'Q2?']);
  });

  it('reports what the model had to work from', async () => {
    const withBoth = await makeUseCase({ briefing: 'Acme is a payments company.' }).useCase.execute(
      { userId: 'user-1', roundId: 'round-1' },
    );
    const withNeither = await makeUseCase({ description: null }).useCase.execute({
      userId: 'user-1',
      roundId: 'round-1',
    });

    expect(withBoth).toMatchObject({ usedJobDescription: true, usedBriefing: true });
    expect(withNeither).toMatchObject({ usedJobDescription: false, usedBriefing: false });
  });

  it('puts the job description and briefing in the prompt, fenced as untrusted data', async () => {
    const { useCase, llmProvider } = makeUseCase({ briefing: 'Acme is a payments company.' });

    await useCase.execute({ userId: 'user-1', roundId: 'round-1', prompt: 'system design' });

    const user = sentMessages(llmProvider).find((m) => m.role === 'user')!.content;
    expect(user).toContain('Build APIs.');
    expect(user).toContain('Acme is a payments company.');
    expect(user).toContain('system design');
    expect(user.match(/<untrusted_external_content>/g)).toHaveLength(2);
  });

  it('caps the job description sent to the model', async () => {
    const long = 'x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_JOB_DESCRIPTION_MAX_CHARS + 500);
    const { useCase, llmProvider } = makeUseCase({ description: long });

    await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    const user = sentMessages(llmProvider).find((m) => m.role === 'user')!.content;
    expect(user).toContain('x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_JOB_DESCRIPTION_MAX_CHARS));
    expect(user).not.toContain(
      'x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_JOB_DESCRIPTION_MAX_CHARS + 1),
    );
  });

  it('adds the user’s custom AI prompt as a second system message', async () => {
    const { useCase, llmProvider } = makeUseCase({ customAiPrompt: 'Keep it friendly.' });

    await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    const system = sentMessages(llmProvider).filter((m) => m.role === 'system');
    expect(system).toHaveLength(2);
    expect(system[1].content).toBe('Keep it friendly.');
  });

  it('rejects a prompt over the limit before calling the model', async () => {
    const { useCase, llmProvider } = makeUseCase();

    const err = await useCase
      .execute({
        userId: 'user-1',
        roundId: 'round-1',
        prompt: 'x'.repeat(AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS + 1),
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(llmProvider.complete).not.toHaveBeenCalled();
  });

  it('clamps the number of questions asked for and returned', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `Question ${i}?`);
    const { useCase, llmProvider } = makeUseCase({ response: reply(many) });

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1', count: 999 });

    expect(result.suggestions).toHaveLength(10);
    expect(sentMessages(llmProvider).find((m) => m.role === 'user')!.content).toContain(
      'Write 10 practice questions',
    );
  });

  it('trims, de-duplicates, drops blanks and caps the length of each question', async () => {
    const long = 'a'.repeat(INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS + 50);
    const { useCase } = makeUseCase({ response: reply(['  Why us?  ', 'why us?', '   ', long]) });

    const result = await useCase.execute({ userId: 'user-1', roundId: 'round-1' });

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]).toBe('Why us?');
    expect(result.suggestions[1]).toHaveLength(INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS);
  });

  it('throws AI_RESPONSE_INVALID for malformed output, and when no usable question is left', async () => {
    const malformed = await makeUseCase({ response: 'not json' })
      .useCase.execute({ userId: 'user-1', roundId: 'round-1' })
      .catch((e) => e);
    const empty = await makeUseCase({ response: reply(['  ', '']) })
      .useCase.execute({ userId: 'user-1', roundId: 'round-1' })
      .catch((e) => e);

    expect((malformed as { code: string }).code).toBe('AI_RESPONSE_INVALID');
    expect((empty as { code: string }).code).toBe('AI_RESPONSE_INVALID');
  });

  it('throws AI_RESPONSE_INVALID when the reply was cut off', async () => {
    const { useCase } = makeUseCase({ truncated: true });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('AI_RESPONSE_INVALID');
  });

  it('throws AI_NOT_CONFIGURED when the user has no API key', async () => {
    const { useCase } = makeUseCase({ hasKey: false });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('AI_NOT_CONFIGURED');
  });

  it('throws RATE_LIMITED before touching anything else when over the limit', async () => {
    const { useCase, llmProviderFactory } = makeUseCase({ allowed: false });

    const err = await useCase.execute({ userId: 'user-1', roundId: 'round-1' }).catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(llmProviderFactory.forUser).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown round and FORBIDDEN for another user’s', async () => {
    const missing = await makeUseCase({ round: null })
      .useCase.execute({ userId: 'user-1', roundId: 'x' })
      .catch((e) => e);
    const foreign = await makeUseCase({ ownerId: 'other-user' })
      .useCase.execute({ userId: 'user-1', roundId: 'round-1' })
      .catch((e) => e);

    expect((missing as { code: string }).code).toBe('NOT_FOUND');
    expect((foreign as { code: string }).code).toBe('FORBIDDEN');
  });
});
