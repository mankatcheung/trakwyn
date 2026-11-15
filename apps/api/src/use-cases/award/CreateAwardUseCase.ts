import type { IAwardRepository } from '#src/use-cases/ports/IAwardRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import {
  optionalLongText,
  optionalText,
  requiredText,
} from '#src/use-cases/shared/profileEntryFields.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateAwardUseCase,
  CreateAwardInput,
  CreateAwardOutput,
} from '#src/use-cases/award/ICreateAwardUseCase.js';

interface Deps {
  awardRepository: IAwardRepository;
  generateId: () => string;
}

export class CreateAwardUseCase implements ICreateAwardUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateAwardInput): Promise<CreateAwardOutput> {
    const existing = await this.deps.awardRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.AWARDS_PER_USER, 'awards');

    return this.deps.awardRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      title: requiredText(input.title, 'title'),
      issuer: optionalText(input.issuer, 'issuer'),
      date: input.date ?? null,
      description: optionalLongText(input.description, 'description'),
    });
  }
}
