import type {
  AnswerSource,
  MockInterviewQuestion,
} from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface UpdateMockInterviewQuestionInput {
  userId: string;
  questionId: string;
  question?: string;
  /** `null` or blank clears the answer; omitted leaves it as it is. */
  answer?: string | null;
  /**
   * Set to `ai` when saving an AI draft. Omitted keeps the stored source, so
   * editing an AI answer by hand leaves it labelled `ai`.
   */
  answerSource?: AnswerSource;
}

export type UpdateMockInterviewQuestionOutput = MockInterviewQuestion;

export interface IUpdateMockInterviewQuestionUseCase {
  execute(input: UpdateMockInterviewQuestionInput): Promise<UpdateMockInterviewQuestionOutput>;
}
