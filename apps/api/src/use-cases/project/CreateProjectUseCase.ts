import type { IProjectRepository } from '#src/use-cases/ports/IProjectRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import {
  optionalLongText,
  optionalText,
  optionalWebUrl,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateProjectUseCase,
  CreateProjectInput,
  CreateProjectOutput,
} from '#src/use-cases/project/ICreateProjectUseCase.js';

interface Deps {
  projectRepository: IProjectRepository;
  generateId: () => string;
}

export class CreateProjectUseCase implements ICreateProjectUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateProjectInput): Promise<CreateProjectOutput> {
    const existing = await this.deps.projectRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.PROJECTS_PER_USER, 'projects');

    return this.deps.projectRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: requiredText(input.name, 'name'),
      role: optionalText(input.role, 'role'),
      url: optionalWebUrl(input.url, 'url'),
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      description: optionalLongText(input.description, 'description'),
    });
  }
}
