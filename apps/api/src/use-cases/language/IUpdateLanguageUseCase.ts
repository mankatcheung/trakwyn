import type { Language } from '#src/domain/language/Language.js';

export interface UpdateLanguageInput {
  id: string;
  userId: string;
  name?: string;
  proficiency?: string | null;
}
export type UpdateLanguageOutput = Language;
export interface IUpdateLanguageUseCase {
  execute(input: UpdateLanguageInput): Promise<UpdateLanguageOutput>;
}
