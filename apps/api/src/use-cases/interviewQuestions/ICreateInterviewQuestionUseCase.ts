import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface CreateInterviewQuestionInput {
  userId: string;
  roundId: string;
  question: string;
  answer?: string | null;
}

export type CreateInterviewQuestionOutput = InterviewQuestion;

export interface ICreateInterviewQuestionUseCase {
  execute(input: CreateInterviewQuestionInput): Promise<CreateInterviewQuestionOutput>;
}
