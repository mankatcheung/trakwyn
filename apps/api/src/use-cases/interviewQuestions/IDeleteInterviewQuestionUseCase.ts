export interface DeleteInterviewQuestionInput {
  userId: string;
  questionId: string;
}

export interface IDeleteInterviewQuestionUseCase {
  execute(input: DeleteInterviewQuestionInput): Promise<void>;
}
