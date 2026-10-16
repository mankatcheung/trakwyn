import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface GetInterviewQuestionsInput {
  userId: string;
  roundId: string;
}

export type GetInterviewQuestionsOutput = InterviewQuestion[];

export interface IGetInterviewQuestionsUseCase {
  execute(input: GetInterviewQuestionsInput): Promise<GetInterviewQuestionsOutput>;
}
