export interface DeleteMockInterviewQuestionInput {
  userId: string;
  questionId: string;
}

export interface IDeleteMockInterviewQuestionUseCase {
  execute(input: DeleteMockInterviewQuestionInput): Promise<void>;
}
