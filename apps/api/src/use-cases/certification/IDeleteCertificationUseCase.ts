export interface DeleteCertificationInput {
  id: string;
  userId: string;
}
export interface IDeleteCertificationUseCase {
  execute(input: DeleteCertificationInput): Promise<void>;
}
