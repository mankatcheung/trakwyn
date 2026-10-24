import { ConflictError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

interface Deps {
  userRepository: IUserRepository;
  billingProvider: IBillingProvider;
  webAppOrigin: string;
}

export interface CreateBillingPortalSessionInput {
  userId: string;
}

/** Opens the provider's hosted page for managing or cancelling. Only someone who has paid has one. */
export class CreateBillingPortalSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateBillingPortalSessionInput): Promise<{ url: string }> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User');
    if (!user.billingCustomerId) {
      throw new ConflictError('There is no billing account to manage yet.');
    }
    return this.deps.billingProvider.createPortalSession({
      customerId: user.billingCustomerId,
      returnUrl: `${this.deps.webAppOrigin}/settings/plan`,
    });
  }
}
