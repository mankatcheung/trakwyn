import { describe, it, expect } from 'vitest';
import { InterviewQuestionMapper } from '#src/interface-adapters/mappers/InterviewQuestionMapper.js';
import { makeInterviewQuestion } from '#src/__tests__/helpers/mocks/interviews.js';

describe('InterviewQuestionMapper', () => {
  const mapper = new InterviewQuestionMapper();

  it('converts the timestamps to ISO strings', () => {
    const dto = mapper.toDTO(
      makeInterviewQuestion({
        createdAt: new Date('2024-05-01T00:00:00.000Z'),
        updatedAt: new Date('2024-05-02T00:00:00.000Z'),
      }),
    );

    expect(dto.createdAt).toBe('2024-05-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2024-05-02T00:00:00.000Z');
  });

  it('passes the fields through and keeps a missing answer as null', () => {
    const dto = mapper.toDTO(
      makeInterviewQuestion({
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
