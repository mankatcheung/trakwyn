import type { Certification } from '#src/domain/certification/Certification.js';

export interface CreateCertificationInput {
  userId: string;
  name: string;
  issuer?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  credentialUrl?: string | null;
}
export type CreateCertificationOutput = Certification;
export interface ICreateCertificationUseCase {
  execute(input: CreateCertificationInput): Promise<CreateCertificationOutput>;
}
