import type { OnboardingGoal } from '#src/domain/user/OnboardingGoal.js';
import { ONBOARDING_GOALS } from '#src/use-cases/constants.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ICompleteOnboardingUseCase } from '#src/use-cases/user/ICompleteOnboardingUseCase.js';

interface Deps {
  userRepository: IUserRepository;
}

const isOnboardingGoal = (value: string): value is OnboardingGoal =>
  (ONBOARDING_GOALS as readonly string[]).includes(value);

export class CompleteOnboardingUseCase implements ICompleteOnboardingUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, goals: readonly string[]): Promise<void> {
    const unknown = goals.filter((goal) => !isOnboardingGoal(goal));
    if (unknown.length > 0) throw new ValidationError(`Unknown onboarding goal: ${unknown[0]}`);

    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.deps.userRepository.update(userId, {
      onboardingGoals: [...new Set(goals.filter(isOnboardingGoal))],
      onboardingCompletedAt: new Date(),
    });
  }
}
