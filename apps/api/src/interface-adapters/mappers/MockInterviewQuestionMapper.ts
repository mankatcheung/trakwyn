import type {
  AnswerSource,
  MockInterviewQuestion,
} from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface MockInterviewQuestionDTO {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  answerSource: AnswerSource;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export class MockInterviewQuestionMapper {
  toDTO(question: MockInterviewQuestion): MockInterviewQuestionDTO {
    return {
      id: question.id,
      interviewRoundId: question.interviewRoundId,
      question: question.question,
      answer: question.answer,
      answerSource: question.answerSource,
      position: question.position,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };
  }
}
