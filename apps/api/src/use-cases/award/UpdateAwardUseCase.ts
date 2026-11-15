import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IAwardRepository } from '#src/use-cases/ports/IAwardRepository.js';
import {
  optionalLongText,
  optionalText,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import type {
  IUpdateAwardUseCase,
  UpdateAwardInput,
  UpdateAwardOutput,
} from '#src/use-cases/award/IUpdateAwardUseCase.js';

interface Deps {
  awardRepository: IAwardRepository;
}

export class UpdateAwardUseCase implements IUpdateAwardUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdateAwardInput): Promise<UpdateAwardOutput> {
    const existing = await this.deps.awardRepository.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new NotFoundError('Award not found');
    }
    return this.deps.awardRepository.update(input.id, {
      ...(input.title !== undefined ? { title: requiredText(input.title, 'title') } : {}),
      ...(input.issuer !== undefined ? { issuer: optionalText(input.issuer, 'issuer') } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.description !== undefined
        ? { description: optionalLongText(input.description, 'description') }
        : {}),
    });
  }
}
