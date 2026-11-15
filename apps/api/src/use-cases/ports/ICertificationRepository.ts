import type { Certification } from '#src/domain/certification/Certification.js';

export type CreateCertificationData = Omit<Certification, 'createdAt'>;
export type UpdateCertificationData = Partial<Omit<Certification, 'id' | 'userId' | 'createdAt'>>;

export interface ICertificationRepository {
  findAllByUserId(userId: string): Promise<Certification[]>;
  findById(id: string): Promise<Certification | null>;
  create(data: CreateCertificationData): Promise<Certification>;
  update(id: string, data: UpdateCertificationData): Promise<Certification>;
  delete(id: string, userId: string): Promise<void>;
}
