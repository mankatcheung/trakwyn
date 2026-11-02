import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  ICreateWorkExperienceUseCase,
  CreateWorkExperienceInput,
  CreateWorkExperienceOutput,
} from '#src/use-cases/workExperience/ICreateWorkExperienceUseCase.js';

interface Deps {
  workExperienceRepository: IWorkExperienceRepository;
  generateId: () => string;
}

export class CreateWorkExperienceUseCase implements ICreateWorkExperienceUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateWorkExperienceInput): Promise<CreateWorkExperienceOutput> {
    const existing = await this.deps.workExperienceRepository.findAllByUserId(input.userId);
    assertUnderLimit(existing.length, CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER, 'work experiences');

    return this.deps.workExperienceRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      company: input.company,
      title: input.title,
      location: input.location ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      description: input.description ?? null,
    });
  }
}
