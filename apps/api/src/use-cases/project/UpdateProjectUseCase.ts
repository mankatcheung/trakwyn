import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IProjectRepository } from '#src/use-cases/ports/IProjectRepository.js';
import {
  optionalLongText,
  optionalText,
  optionalWebUrl,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import type {
  IUpdateProjectUseCase,
  UpdateProjectInput,
  UpdateProjectOutput,
} from '#src/use-cases/project/IUpdateProjectUseCase.js';

interface Deps {
  projectRepository: IProjectRepository;
}

export class UpdateProjectUseCase implements IUpdateProjectUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateProjectInput): Promise<UpdateProjectOutput> {
    const existing = await this.deps.projectRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Project not found');
    }
    return this.deps.projectRepository.update(input.id, {
      ...(input.name !== undefined ? { name: requiredText(input.name, 'name') } : {}),
      ...(input.role !== undefined ? { role: optionalText(input.role, 'role') } : {}),
      ...(input.url !== undefined ? { url: optionalWebUrl(input.url, 'url') } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.description !== undefined
        ? { description: optionalLongText(input.description, 'description') }
        : {}),
    });
  }
}
