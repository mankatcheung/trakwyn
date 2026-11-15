import type { Language } from '#src/domain/language/Language.js';

export type CreateLanguageData = Omit<Language, 'createdAt'>;
export type UpdateLanguageData = Partial<Omit<Language, 'id' | 'userId' | 'createdAt'>>;

export interface ILanguageRepository {
  findAllByUserId(userId: string): Promise<Language[]>;
  findById(id: string): Promise<Language | null>;
  create(data: CreateLanguageData): Promise<Language>;
  update(id: string, data: UpdateLanguageData): Promise<Language>;
  delete(id: string, userId: string): Promise<void>;
}
