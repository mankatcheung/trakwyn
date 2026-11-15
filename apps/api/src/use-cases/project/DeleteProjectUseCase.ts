import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IProjectRepository } from '#src/use-cases/ports/IProjectRepository.js';
import type {
  IDeleteProjectUseCase,
  DeleteProjectInput,
} from '#src/use-cases/project/IDeleteProjectUseCase.js';

interface Deps {
  projectRepository: IProjectRepository;
}

export class DeleteProjectUseCase implements IDeleteProjectUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteProjectInput): Promise<void> {
    const existing = await this.deps.projectRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Project not found');
    }
    await this.deps.projectRepository.delete(input.id, existing.userId);
  }
}
