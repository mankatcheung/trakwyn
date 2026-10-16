import type {
  AnswerSource,
  MockInterviewQuestion,
} from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface CreateMockInterviewQuestionData {
  id: string;
  interviewRoundId: string;
  question: string;
  answer?: string | null;
  /** Defaults to `user`. */
  answerSource?: AnswerSource;
}

export interface UpdateMockInterviewQuestionData {
  question?: string;
  answer?: string | null;
  answerSource?: AnswerSource;
}

export interface IMockInterviewQuestionRepository {
  /** In display order. */
  findAllByRoundId(interviewRoundId: string): Promise<MockInterviewQuestion[]>;
  findById(id: string): Promise<MockInterviewQuestion | null>;
  /**
   * Appends to the end of the round. Reserves a slot against
   * `CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND` atomically and throws
   * `QuotaExceededError` when the round is full.
   */
  create(data: CreateMockInterviewQuestionData): Promise<MockInterviewQuestion>;
  update(id: string, data: UpdateMockInterviewQuestionData): Promise<MockInterviewQuestion>;
  /** Releases the round's quota slot along with the row. */
  delete(id: string): Promise<void>;
  /** Sets each question's position to its index in `orderedIds`. */
  reorder(interviewRoundId: string, orderedIds: string[]): Promise<void>;
}
