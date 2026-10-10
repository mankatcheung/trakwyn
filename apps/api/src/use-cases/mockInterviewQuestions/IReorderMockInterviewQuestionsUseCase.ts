import type { MockInterviewQuestion } from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface ReorderMockInterviewQuestionsInput {
  userId: string;
  roundId: string;
  /** Every question id in the round, in the order they should appear. */
  orderedIds: string[];
}

export type ReorderMockInterviewQuestionsOutput = MockInterviewQuestion[];

export interface IReorderMockInterviewQuestionsUseCase {
  execute(input: ReorderMockInterviewQuestionsInput): Promise<ReorderMockInterviewQuestionsOutput>;
}
