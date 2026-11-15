export interface DeleteLanguageInput {
  id: string;
  userId: string;
}
export interface IDeleteLanguageUseCase {
  execute(input: DeleteLanguageInput): Promise<void>;
}
