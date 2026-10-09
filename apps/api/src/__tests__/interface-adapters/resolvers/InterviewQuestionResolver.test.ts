import { describe, it, expect, vi } from 'vitest';
import { InterviewQuestionResolver } from '#src/interface-adapters/resolvers/InterviewQuestionResolver.js';
import { InterviewQuestionMapper } from '#src/interface-adapters/mappers/InterviewQuestionMapper.js';
import { makeInterviewQuestion } from '#src/__tests__/helpers/mocks/interviews.js';
import type { ICreateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/ICreateInterviewQuestionUseCase.js';
import type { IGetInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/IGetInterviewQuestionsUseCase.js';
import type { IUpdateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/IUpdateInterviewQuestionUseCase.js';
import type { IDeleteInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/IDeleteInterviewQuestionUseCase.js';
import type { IReorderInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/IReorderInterviewQuestionsUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeDeps = (overrides?: object) => ({
  createInterviewQuestionUseCase: stub<ICreateInterviewQuestionUseCase>({ execute: vi.fn() }),
  getInterviewQuestionsUseCase: stub<IGetInterviewQuestionsUseCase>({ execute: vi.fn() }),
  updateInterviewQuestionUseCase: stub<IUpdateInterviewQuestionUseCase>({ execute: vi.fn() }),
  deleteInterviewQuestionUseCase: stub<IDeleteInterviewQuestionUseCase>({ execute: vi.fn() }),
  reorderInterviewQuestionsUseCase: stub<IReorderInterviewQuestionsUseCase>({ execute: vi.fn() }),
  interviewQuestionMapper: new InterviewQuestionMapper(),
  ...overrides,
});

describe('InterviewQuestionResolver', () => {
  it('getInterviewQuestions: delegates and maps each question to a DTO', async () => {
    const deps = makeDeps({
      getInterviewQuestionsUseCase: stub<IGetInterviewQuestionsUseCase>({
        execute: vi
          .fn()
          .mockResolvedValue([
            makeInterviewQuestion({ id: 'q1' }),
            makeInterviewQuestion({ id: 'q2' }),
          ]),
      }),
    });

    const result = await new InterviewQuestionResolver(deps).getInterviewQuestions(
      'user-1',
      'round-1',
    );

    expect(deps.getInterviewQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
    });
    expect(result.map((q) => q.id)).toEqual(['q1', 'q2']);
  });

  it('createInterviewQuestion: passes the user and input through and returns the DTO', async () => {
    const deps = makeDeps({
      createInterviewQuestionUseCase: stub<ICreateInterviewQuestionUseCase>({
        execute: vi.fn().mockResolvedValue(makeInterviewQuestion({ id: 'q1', question: 'Why?' })),
      }),
    });

    const result = await new InterviewQuestionResolver(deps).createInterviewQuestion('user-1', {
      roundId: 'round-1',
      question: 'Why?',
      answer: null,
    });

    expect(deps.createInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
      question: 'Why?',
      answer: null,
    });
    expect(result).toMatchObject({ id: 'q1', question: 'Why?' });
  });

  it('updateInterviewQuestion: passes the ids and changes through', async () => {
    const deps = makeDeps({
      updateInterviewQuestionUseCase: stub<IUpdateInterviewQuestionUseCase>({
        execute: vi.fn().mockResolvedValue(makeInterviewQuestion({ answer: 'A' })),
      }),
    });

    const result = await new InterviewQuestionResolver(deps).updateInterviewQuestion(
      'user-1',
      'question-1',
      { answer: 'A' },
    );

    expect(deps.updateInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'question-1',
      answer: 'A',
    });
    expect(result.answer).toBe('A');
  });

  it('deleteInterviewQuestion: returns true once the use case resolves', async () => {
    const deps = makeDeps({
      deleteInterviewQuestionUseCase: stub<IDeleteInterviewQuestionUseCase>({
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await new InterviewQuestionResolver(deps).deleteInterviewQuestion(
      'user-1',
      'question-1',
    );

    expect(deps.deleteInterviewQuestionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'question-1',
    });
    expect(result).toBe(true);
  });

  it('reorderInterviewQuestions: passes the order and maps the result', async () => {
    const deps = makeDeps({
      reorderInterviewQuestionsUseCase: stub<IReorderInterviewQuestionsUseCase>({
        execute: vi
          .fn()
          .mockResolvedValue([
            makeInterviewQuestion({ id: 'b' }),
            makeInterviewQuestion({ id: 'a' }),
          ]),
      }),
    });

    const result = await new InterviewQuestionResolver(deps).reorderInterviewQuestions(
      'user-1',
      'round-1',
      ['b', 'a'],
    );

    expect(deps.reorderInterviewQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'round-1',
      orderedIds: ['b', 'a'],
    });
    expect(result.map((q) => q.id)).toEqual(['b', 'a']);
  });
});
