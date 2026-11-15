export interface DeleteAwardInput {
  id: string;
  userId: string;
}
export interface IDeleteAwardUseCase {
  execute(input: DeleteAwardInput): Promise<void>;
}
