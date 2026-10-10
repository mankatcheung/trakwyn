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

/**
 * Mirrors the practice-question limits in `apps/api/src/use-cases/constants.ts`
 * (`CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND`, `MOCK_QUESTION_GENERATION` and
 * `AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS`). Same caveat: the API
 * enforces them, these only size inputs and decide what to offer.
 */
export const MOCK_QUESTION_LIMITS = {
  QUESTIONS_PER_ROUND: 30,
  PROMPT_MAX_CHARS: 500,
  GENERATE_COUNT: 5,
} as const;
