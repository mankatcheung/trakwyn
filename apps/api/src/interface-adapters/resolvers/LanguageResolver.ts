import type { ICreateLanguageUseCase } from '#src/use-cases/language/ICreateLanguageUseCase.js';
import type { IUpdateLanguageUseCase } from '#src/use-cases/language/IUpdateLanguageUseCase.js';
import type { IDeleteLanguageUseCase } from '#src/use-cases/language/IDeleteLanguageUseCase.js';
import type { ILanguageRepository } from '#src/use-cases/ports/ILanguageRepository.js';
import type {
  LanguageMapper,
  LanguageDTO,
} from '#src/interface-adapters/mappers/LanguageMapper.js';

interface Deps {
  createLanguageUseCase: ICreateLanguageUseCase;
  updateLanguageUseCase: IUpdateLanguageUseCase;
  deleteLanguageUseCase: IDeleteLanguageUseCase;
  languageRepository: ILanguageRepository;
  languageMapper: LanguageMapper;
}

interface CreateInput {
  name: string;
  proficiency?: string;
}

interface UpdateInput {
  name?: string;
  proficiency?: string | null;
}

export class LanguageResolver {
  constructor(private readonly deps: Deps) {}

  async getLanguages(userId: string): Promise<LanguageDTO[]> {
    const items = await this.deps.languageRepository.findAllByUserId(userId);
    return items.map((item) => this.deps.languageMapper.toDTO(item));
  }

  async createLanguage(userId: string, input: CreateInput): Promise<LanguageDTO> {
    const result = await this.deps.createLanguageUseCase.execute({
      userId,
      name: input.name,
      proficiency: input.proficiency,
    });
    return this.deps.languageMapper.toDTO(result);
  }

  async updateLanguage(userId: string, id: string, input: UpdateInput): Promise<LanguageDTO> {
    const result = await this.deps.updateLanguageUseCase.execute({
      id,
      userId,
      name: input.name,
      proficiency: input.proficiency,
    });
    return this.deps.languageMapper.toDTO(result);
  }

  async deleteLanguage(userId: string, id: string): Promise<void> {
    await this.deps.deleteLanguageUseCase.execute({ id, userId });
  }
}
