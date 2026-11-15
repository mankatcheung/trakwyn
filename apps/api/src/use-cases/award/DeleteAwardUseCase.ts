import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IAwardRepository } from '#src/use-cases/ports/IAwardRepository.js';
import type {
  IDeleteAwardUseCase,
  DeleteAwardInput,
} from '#src/use-cases/award/IDeleteAwardUseCase.js';

interface Deps {
  awardRepository: IAwardRepository;
}

export class DeleteAwardUseCase implements IDeleteAwardUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DeleteAwardInput): Promise<void> {
    const existing = await this.deps.awardRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Award not found');
    }
    await this.deps.awardRepository.delete(input.id, existing.userId);
  }
}
