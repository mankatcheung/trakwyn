import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import { optionalText, requiredText } from '#src/use-cases/shared/profileEntryFields.js';
import type {
  IUpdateLanguageUseCase,
  UpdateLanguageInput,
  UpdateLanguageOutput,
} from '#src/use-cases/language/IUpdateLanguageUseCase.js';

interface Deps {
  languageRepository: ILanguageRepository;
}

export class UpdateLanguageUseCase implements IUpdateLanguageUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateLanguageInput): Promise<UpdateLanguageOutput> {
    const existing = await this.deps.languageRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Language not found');
    }
    return this.deps.languageRepository.update(input.id, {
      ...(input.name !== undefined ? { name: requiredText(input.name, 'name') } : {}),
      ...(input.proficiency !== undefined
        ? { proficiency: optionalText(input.proficiency, 'proficiency') }
        : {}),
    });
  }
}
