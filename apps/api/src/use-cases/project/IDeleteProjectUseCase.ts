export interface DeleteProjectInput {
  id: string;
  userId: string;
}
export interface IDeleteProjectUseCase {
  execute(input: DeleteProjectInput): Promise<void>;
}
