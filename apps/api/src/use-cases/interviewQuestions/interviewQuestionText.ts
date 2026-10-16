import { INTERVIEW_QUESTION_LIMITS } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';

/** The question is required: trims it and rejects a blank or over-long one. */
export function normaliseQuestion(raw: string): string {
  const question = raw.trim();
  if (!question) throw new ValidationError('Question is required');
  if (question.length > INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS) {
    throw new ValidationError(
      `Question must be at most ${INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS} characters`,
    );
  }
  return question;
}

/** The answer is optional: a blank one is stored as `null`, i.e. not answered yet. */
export function normaliseAnswer(raw: string | null): string | null {
  if (raw === null) return null;
  const answer = raw.trim();
  if (!answer) return null;
  if (answer.length > INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS) {
    throw new ValidationError(
      `Response must be at most ${INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS} characters`,
    );
  }
  return answer;
}
