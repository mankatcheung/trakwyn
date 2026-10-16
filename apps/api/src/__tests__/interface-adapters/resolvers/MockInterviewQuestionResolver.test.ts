import { describe, it, expect, vi } from 'vitest';
import { MockInterviewQuestionResolver } from '#src/interface-adapters/resolvers/MockInterviewQuestionResolver.js';
import { MockInterviewQuestionMapper } from '#src/interface-adapters/mappers/MockInterviewQuestionMapper.js';
import { makeMockInterviewQuestion } from '#src/__tests__/helpers/mocks/interviews.js';
import type { ICreateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/ICreateMockInterviewQuestionUseCase.js';
import type { IGetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGetMockInterviewQuestionsUseCase.js';
import type { IUpdateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/IUpdateMockInterviewQuestionUseCase.js';
import type { IDeleteMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/IDeleteMockInterviewQuestionUseCase.js';
import type { IReorderMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IReorderMockInterviewQuestionsUseCase.js';

import type { IGenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockQuestionsUseCase.js';
import type { IGenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/IGenerateMockAnswerUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeDeps = (overrides?: object) => ({
  createMockInterviewQuestionUseCase: stub<ICreateMockInterviewQuestionUseCase>({
    execute: vi.fn(),
  }),
  getMockInterviewQuestionsUseCase: stub<IGetMockInterviewQuestionsUseCase>({ execute: vi.fn() }),
  updateMockInterviewQuestionUseCase: stub<IUpdateMockInterviewQuestionUseCase>({
    execute: vi.fn(),
  }),
  deleteMockInterviewQuestionUseCase: stub<IDeleteMockInterviewQuestionUseCase>({
    execute: vi.fn(),
  }),
  reorderMockInterviewQuestionsUseCase: stub<IReorderMockInterviewQuestionsUseCase>({
    execute: vi.fn(),
  }),
  generateMockQuestionsUseCase: stub<IGenerateMockQuestionsUseCase>({ execute: vi.fn() }),
  generateMockAnswerUseCase: stub<IGenerateMockAnswerUseCase>({ execute: vi.fn() }),
  mockInterviewQuestionMapper: new MockInterviewQuestionMapper(),
  ...overrides,
});

describe('MockInterviewQuestionResolver', () => {
  it('getMockInterviewQuestions: delegates and maps each question to a DTO', async () => {
    const deps = makeDeps({
      getMockInterviewQuestionsUseCase: stub<IGetMockInterviewQuestionsUseCase>({
        execute: vi
          .fn()
          .mockResolvedValue([
            makeMockInterviewQuestion({ id: 'q1' }),
            makeMockInterviewQuestion({ id: 'q2' }),
          ]),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).getMockInterviewQuestions(
      'user-1',
      'round-1',
    );

    expect(deps.getMockInterviewQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
    });
    expect(result.map((q) => q.id)).toEqual(['q1', 'q2']);
  });

  it('createMockInterviewQuestion: passes the user and input through and returns the DTO', async () => {
    const deps = makeDeps({
      createMockInterviewQuestionUseCase: stub<ICreateMockInterviewQuestionUseCase>({
        execute: vi
          .fn()
          .mockResolvedValue(makeMockInterviewQuestion({ id: 'q1', question: 'Why?' })),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).createMockInterviewQuestion(
      'user-1',
      {
        roundId: 'round-1',
        question: 'Why?',
        answer: null,
      },
    );

    expect(deps.createMockInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why?',
      answer: null,
    });
    expect(result).toMatchObject({ id: 'q1', question: 'Why?' });
  });

  it('updateMockInterviewQuestion: passes the ids and changes through', async () => {
    const deps = makeDeps({
      updateMockInterviewQuestionUseCase: stub<IUpdateMockInterviewQuestionUseCase>({
        execute: vi.fn().mockResolvedValue(makeMockInterviewQuestion({ answer: 'A' })),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).updateMockInterviewQuestion(
      'user-1',
      'question-1',
      { answer: 'A' },
    );

    expect(deps.updateMockInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'question-1',
      answer: 'A',
    });
    expect(result.answer).toBe('A');
  });

  it('deleteMockInterviewQuestion: returns true once the use case resolves', async () => {
    const deps = makeDeps({
      deleteMockInterviewQuestionUseCase: stub<IDeleteMockInterviewQuestionUseCase>({
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).deleteMockInterviewQuestion(
      'user-1',
      'question-1',
    );

    expect(deps.deleteMockInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'question-1',
    });
    expect(result).toBe(true);
  });

  it('reorderMockInterviewQuestions: passes the order and maps the result', async () => {
    const deps = makeDeps({
      reorderMockInterviewQuestionsUseCase: stub<IReorderMockInterviewQuestionsUseCase>({
        execute: vi
          .fn()
          .mockResolvedValue([
            makeMockInterviewQuestion({ id: 'b' }),
            makeMockInterviewQuestion({ id: 'a' }),
          ]),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).reorderMockInterviewQuestions(
      'user-1',
      'round-1',
      ['b', 'a'],
    );

    expect(deps.reorderMockInterviewQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
      orderedIds: ['b', 'a'],
    });
    expect(result.map((q) => q.id)).toEqual(['b', 'a']);
  });

  it('generateMockQuestions: passes the user and input through and returns the suggestions', async () => {
    const output = { suggestions: ['Why us?'], usedJobDescription: true, usedBriefing: false };
    const deps = makeDeps({
      generateMockQuestionsUseCase: stub<IGenerateMockQuestionsUseCase>({
        execute: vi.fn().mockResolvedValue(output),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).generateMockQuestions('user-1', {
      roundId: 'round-1',
      prompt: 'system design',
      count: 3,
    });

    expect(deps.generateMockQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
      prompt: 'system design',
      count: 3,
    });
    expect(result).toBe(output);
  });

  it('generateMockAnswer: passes the user and input through and returns the draft', async () => {
    const output = { answer: 'I would…', usedJobDescription: false, usedBriefing: false };
    const deps = makeDeps({
      generateMockAnswerUseCase: stub<IGenerateMockAnswerUseCase>({
        execute: vi.fn().mockResolvedValue(output),
      }),
    });

    const result = await new MockInterviewQuestionResolver(deps).generateMockAnswer('user-1', {
      questionId: 'q1',
    });

    expect(deps.generateMockAnswerUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'q1',
    });
    expect(result).toBe(output);
  });
});
