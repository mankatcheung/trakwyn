import type { Award } from '#src/domain/award/Award.js';

export type CreateAwardData = Omit<Award, 'createdAt'>;
export type UpdateAwardData = Partial<Omit<Award, 'id' | 'userId' | 'createdAt'>>;

export interface IAwardRepository {
  findAllByUserId(userId: string): Promise<Award[]>;
  findById(id: string): Promise<Award | null>;
  create(data: CreateAwardData): Promise<Award>;
  update(id: string, data: UpdateAwardData): Promise<Award>;
  delete(id: string, userId: string): Promise<void>;
}
