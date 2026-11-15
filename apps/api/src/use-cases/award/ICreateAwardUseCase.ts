import type { Award } from '#src/domain/award/Award.js';

export interface CreateAwardInput {
  userId: string;
  title: string;
  issuer?: string | null;
  date?: Date | null;
  description?: string | null;
}
export type CreateAwardOutput = Award;
export interface ICreateAwardUseCase {
  execute(input: CreateAwardInput): Promise<CreateAwardOutput>;
}
