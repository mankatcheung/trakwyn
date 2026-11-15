import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import type {
  IDeleteLanguageUseCase,
  DeleteLanguageInput,
} from '#src/use-cases/language/IDeleteLanguageUseCase.js';

interface Deps {
  languageRepository: ILanguageRepository;
}

export class DeleteLanguageUseCase implements IDeleteLanguageUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteLanguageInput): Promise<void> {
    const existing = await this.deps.languageRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Language not found');
    }
    await this.deps.languageRepository.delete(input.id, existing.userId);
  }
}
