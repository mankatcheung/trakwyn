import type { MockInterviewQuestion } from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface GetMockInterviewQuestionsInput {
  userId: string;
  roundId: string;
}

export type GetMockInterviewQuestionsOutput = MockInterviewQuestion[];

export interface IGetMockInterviewQuestionsUseCase {
  execute(input: GetMockInterviewQuestionsInput): Promise<GetMockInterviewQuestionsOutput>;
}
