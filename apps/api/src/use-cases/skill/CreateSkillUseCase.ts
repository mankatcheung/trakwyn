import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateSkillUseCase,
  CreateSkillInput,
  CreateSkillOutput,
} from '#src/use-cases/skill/ICreateSkillUseCase.js';

interface Deps {
  skillRepository: ISkillRepository;
  generateId: () => string;
}

export class CreateSkillUseCase implements ICreateSkillUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateSkillInput): Promise<CreateSkillOutput> {
    const existing = await this.deps.skillRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.SKILLS_PER_USER, 'skills');

    return this.deps.skillRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      name: input.name,
      category: input.category ?? null,
      proficiency: input.proficiency ?? null,
    });
  }
}
