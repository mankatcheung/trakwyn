import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export interface InterviewQuestionDTO {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export class InterviewQuestionMapper {
  toDTO(question: InterviewQuestion): InterviewQuestionDTO {
    return {
      id: question.id,
      interviewRoundId: question.interviewRoundId,
      question: question.question,
      answer: question.answer,
      position: question.position,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };
  }
}
