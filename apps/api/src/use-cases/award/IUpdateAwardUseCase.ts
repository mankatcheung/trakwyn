import type { Award } from '#src/domain/award/Award.js';

export interface UpdateAwardInput {
  id: string;
  userId: string;
  title?: string;
  issuer?: string | null;
  date?: Date | null;
  description?: string | null;
}
export type UpdateAwardOutput = Award;
export interface IUpdateAwardUseCase {
  execute(input: UpdateAwardInput): Promise<UpdateAwardOutput>;
}
