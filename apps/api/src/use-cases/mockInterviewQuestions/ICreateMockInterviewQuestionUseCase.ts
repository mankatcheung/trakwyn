import type {
  AnswerSource,
  MockInterviewQuestion,
} from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface CreateMockInterviewQuestionInput {
  userId: string;
  roundId: string;
  question: string;
  answer?: string | null;
  /** `ai` marks an answer that began as an AI draft. Ignored when there is no answer. */
  answerSource?: AnswerSource;
}

export type CreateMockInterviewQuestionOutput = MockInterviewQuestion;

export interface ICreateMockInterviewQuestionUseCase {
  execute(input: CreateMockInterviewQuestionInput): Promise<CreateMockInterviewQuestionOutput>;
}
