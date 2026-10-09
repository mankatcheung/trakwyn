/**
 * Mirrors `CONTENT_LIMITS.QUESTIONS_PER_ROUND` and `INTERVIEW_QUESTION_LIMITS`
 * in `apps/api/src/use-cases/constants.ts`. The API enforces them; these only
 * size the inputs and decide when to stop offering "Add question", so a value
 * drifting here costs a clearer error message, not a hole in the rule.
 */
export const INTERVIEW_QUESTION_LIMITS = {
  QUESTIONS_PER_ROUND: 50,
  QUESTION_MAX_CHARS: 500,
  ANSWER_MAX_CHARS: 4000,
} as const;
