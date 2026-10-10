import { describe, it, expect } from 'vitest';
import { MockInterviewQuestionMapper } from '#src/interface-adapters/mappers/MockInterviewQuestionMapper.js';
import { makeMockInterviewQuestion } from '#src/__tests__/helpers/mocks/interviews.js';

describe('MockInterviewQuestionMapper', () => {
  const mapper = new MockInterviewQuestionMapper();

  it('converts the timestamps to ISO strings', () => {
    const dto = mapper.toDTO(
      makeMockInterviewQuestion({
        createdAt: new Date('2024-05-01T00:00:00.000Z'),
        updatedAt: new Date('2024-05-02T00:00:00.000Z'),
      }),
    );

    expect(dto.createdAt).toBe('2024-05-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2024-05-02T00:00:00.000Z');
  });

  it('exposes the answer source', () => {
    expect(mapper.toDTO(makeMockInterviewQuestion({ answerSource: 'ai' })).answerSource).toBe('ai');
    expect(mapper.toDTO(makeMockInterviewQuestion()).answerSource).toBe('user');
  });

  it('passes the fields through and keeps a missing answer as null', () => {
    const dto = mapper.toDTO(
      makeMockInterviewQuestion({
        id: 'q-9',
        interviewRoundId: 'r-9',
        question: 'Why us?',
        answer: null,
        position: 4,
      }),
    );

    expect(dto).toMatchObject({
      id: 'q-9',
      interviewRoundId: 'r-9',
      question: 'Why us?',
      answer: null,
      position: 4,
    });
  });
});
