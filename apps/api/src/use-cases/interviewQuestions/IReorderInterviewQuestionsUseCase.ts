import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface ReorderInterviewQuestionsInput {
  userId: string;
  roundId: string;
  /** Every question id in the round, in the order they should appear. */
  orderedIds: string[];
}

export type ReorderInterviewQuestionsOutput = InterviewQuestion[];

export interface IReorderInterviewQuestionsUseCase {
  execute(input: ReorderInterviewQuestionsInput): Promise<ReorderInterviewQuestionsOutput>;
}
