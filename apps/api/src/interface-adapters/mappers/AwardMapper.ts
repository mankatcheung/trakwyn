import type { Award } from '#src/domain/award/Award.js';

export interface AwardDTO {
  id: string;
  userId: string;
  title: string;
  issuer: string | null;
  date: string | null;
  description: string | null;
  createdAt: string;
}

export class AwardMapper {
  toDTO(entity: Award): AwardDTO {
    return {
      id: entity.id,
      userId: entity.userId,
      title: entity.title,
      issuer: entity.issuer,
      date: entity.date?.toISOString() ?? null,
      description: entity.description,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
