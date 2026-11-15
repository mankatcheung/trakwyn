import type { Language } from '#src/domain/language/Language.js';

export interface LanguageDTO {
  id: string;
  userId: string;
  name: string;
  proficiency: string | null;
  createdAt: string;
}

export class LanguageMapper {
  toDTO(entity: Language): LanguageDTO {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      proficiency: entity.proficiency,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
