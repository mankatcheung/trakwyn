/** Who wrote an answer: the user, or an AI draft the user kept. */
export type AnswerSource = 'user' | 'ai';

/**
 * A practice question for an interview round, with the user's prepared answer.
 * Deliberately separate from `InterviewQuestion`, which records what was actually
 * asked in the interview.
 */
export interface MockInterviewQuestion {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  /** `ai` stays once set, even if the user edits the text; clearing the answer resets it. */
  answerSource: AnswerSource;
  /** Zero-based order within the round. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}
