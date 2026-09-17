import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IDismissOnboardingChecklistUseCase } from '#src/use-cases/user/IDismissOnboardingChecklistUseCase.js';

interface Deps {
  userRepository: IUserRepository;
}

export class DismissOnboardingChecklistUseCase implements IDismissOnboardingChecklistUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.deps.userRepository.update(userId, {
      onboardingChecklistDismissedAt: new Date(),
    });
  }
}
