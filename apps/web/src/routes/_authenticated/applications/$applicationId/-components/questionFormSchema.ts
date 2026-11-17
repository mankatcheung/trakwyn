import { z } from 'zod';
import { INTERVIEW_QUESTION_LIMITS } from './interviewQuestionLimits';

/**
 * The add and edit form shared by the interview-question and practice-question
 * panels. The limits mirror the API's; the schema is what enforces them, the
 * inputs' `maxLength` only stops typing early.
 */
export const questionFormSchema = z.object({
  question: z
    .string()
    .max(
      INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS,
      `Must be at most ${INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS} characters`,
    )
    .refine((value) => value.trim().length > 0, 'Enter a question'),
  answer: z
    .string()
    .max(
      INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS,
      `Must be at most ${INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS} characters`,
    ),
});

export type QuestionFormValues = z.infer<typeof questionFormSchema>;
