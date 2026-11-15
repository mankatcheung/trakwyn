import type { Language } from '#src/domain/language/Language.js';

export interface CreateLanguageInput {
  userId: string;
  name: string;
  proficiency?: string | null;
}
export type CreateLanguageOutput = Language;
export interface ICreateLanguageUseCase {
  execute(input: CreateLanguageInput): Promise<CreateLanguageOutput>;
}
