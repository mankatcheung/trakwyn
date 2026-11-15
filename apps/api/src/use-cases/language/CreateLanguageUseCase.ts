import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import { optionalText, requiredText } from '#src/use-cases/shared/profileEntryFields.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateLanguageUseCase,
  CreateLanguageInput,
  CreateLanguageOutput,
} from '#src/use-cases/language/ICreateLanguageUseCase.js';

interface Deps {
  languageRepository: ILanguageRepository;
  generateId: () => string;
}

export class CreateLanguageUseCase implements ICreateLanguageUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateLanguageInput): Promise<CreateLanguageOutput> {
    const existing = await this.deps.languageRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.LANGUAGES_PER_USER, 'languages');

    return this.deps.languageRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: requiredText(input.name, 'name'),
      proficiency: optionalText(input.proficiency, 'proficiency'),
    });
  }
}
