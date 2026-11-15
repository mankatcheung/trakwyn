import type { Certification } from '#src/domain/certification/Certification.js';

export interface CertificationDTO {
  id: string;
  userId: string;
  name: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
  createdAt: string;
}

export class CertificationMapper {
  toDTO(entity: Certification): CertificationDTO {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      issuer: entity.issuer,
      issuedAt: entity.issuedAt?.toISOString() ?? null,
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      credentialUrl: entity.credentialUrl,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
