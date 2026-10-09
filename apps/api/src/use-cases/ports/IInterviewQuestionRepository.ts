import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface CreateInterviewQuestionData {
  id: string;
  interviewRoundId: string;
  question: string;
  answer?: string | null;
}

export interface UpdateInterviewQuestionData {
  question?: string;
  answer?: string | null;
}

export interface IInterviewQuestionRepository {
  /** In display order. */
  findAllByRoundId(interviewRoundId: string): Promise<InterviewQuestion[]>;
  findById(id: string): Promise<InterviewQuestion | null>;
  /**
   * Appends to the end of the round. Reserves a slot against
   * `CONTENT_LIMITS.QUESTIONS_PER_ROUND` atomically and throws
   * `QuotaExceededError` when the round is full.
   */
  create(data: CreateInterviewQuestionData): Promise<InterviewQuestion>;
  update(id: string, data: UpdateInterviewQuestionData): Promise<InterviewQuestion>;
  /** Releases the round's quota slot along with the row. */
  delete(id: string): Promise<void>;
  /** Sets each question's position to its index in `orderedIds`. */
  reorder(interviewRoundId: string, orderedIds: string[]): Promise<void>;
}
