import { describe, expect, it } from 'vitest';
import { INTERVIEW_QUESTION_LIMITS } from '#/features/interviews/lib/interviewQuestionLimits';
import { questionFormSchema } from '#/features/interviews/lib/questionFormSchema';

const { QUESTION_MAX_CHARS, ANSWER_MAX_CHARS } = INTERVIEW_QUESTION_LIMITS;

function messages(input: { question: string; answer: string }) {
  const result = questionFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('questionFormSchema', () => {
  it('accepts a question with and without an answer', () => {
    expect(questionFormSchema.safeParse({ question: 'Why us?', answer: '' }).success).toBe(true);
    expect(questionFormSchema.safeParse({ question: 'Why us?', answer: 'Because' }).success).toBe(
      true,
    );
  });

  it.each(['', '   ', '\n\t'])('asks for a question when it is %j', (question) => {
    expect(messages({ question, answer: '' })).toEqual([['question', 'Enter a question']]);
  });

  it('accepts a question at the limit and rejects one over it', () => {
    expect(messages({ question: 'a'.repeat(QUESTION_MAX_CHARS), answer: '' })).toEqual([]);
    expect(messages({ question: 'a'.repeat(QUESTION_MAX_CHARS + 1), answer: '' })).toEqual([
      ['question', `Must be at most ${QUESTION_MAX_CHARS} characters`],
    ]);
  });

  it('accepts an answer at the limit and rejects one over it', () => {
    expect(messages({ question: 'q', answer: 'a'.repeat(ANSWER_MAX_CHARS) })).toEqual([]);
    expect(messages({ question: 'q', answer: 'a'.repeat(ANSWER_MAX_CHARS + 1) })).toEqual([
      ['answer', `Must be at most ${ANSWER_MAX_CHARS} characters`],
    ]);
  });
});
