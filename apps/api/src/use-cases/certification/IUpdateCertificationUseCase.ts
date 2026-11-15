import type { Certification } from '#src/domain/certification/Certification.js';

export interface UpdateCertificationInput {
  id: string;
  userId: string;
  name?: string;
  issuer?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  credentialUrl?: string | null;
}
export type UpdateCertificationOutput = Certification;
export interface IUpdateCertificationUseCase {
  execute(input: UpdateCertificationInput): Promise<UpdateCertificationOutput>;
}
