import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface UpdateInterviewQuestionInput {
  userId: string;
  questionId: string;
  question?: string;
  /** `null` or blank clears the answer; omitted leaves it as it is. */
  answer?: string | null;
}

export type UpdateInterviewQuestionOutput = InterviewQuestion;

export interface IUpdateInterviewQuestionUseCase {
  execute(input: UpdateInterviewQuestionInput): Promise<UpdateInterviewQuestionOutput>;
}
