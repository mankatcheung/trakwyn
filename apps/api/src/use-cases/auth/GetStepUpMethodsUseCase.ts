import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import type { IOAuthAccountRepository } from '#src/use-cases/ports/IOAuthAccountRepository.js';
import type { IOAuthProviderRegistry } from '#src/use-cases/ports/IOAuthProviderRegistry.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';

/**
 * How a signed-in user can prove it is them again (JEF-463): a provider name
 * means "sign in again with it", and the clients offer the methods in order.
 */
export type StepUpMethod = 'password' | OAuthProviderName | 'email_code';

interface Deps {
  userRepository: IUserRepository;
  oauthAccountRepository: IOAuthAccountRepository;
  oauthProviderRegistry: IOAuthProviderRegistry;
}

/**
 * The one place that decides which step-up methods an account is offered, so
 * the clients never work it out from `hasPassword` and linked providers
 * themselves.
 *
 * - With a password: the password (and TOTP if on). Nothing weaker is offered
 *   beside it, or it would be the way around the password.
 * - Without: each linked provider that can prove a fresh sign-in, then an
 *   emailed code, which always works because every account has an inbox.
 */
export class GetStepUpMethodsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<StepUpMethod[]> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) return [];
    if (user.passwordHash !== null) return ['password'];

    const accounts = await this.deps.oauthAccountRepository.findAllByUserId(userId);
    const providers = [...new Set(accounts.map((account) => account.provider))].filter(
      (provider) => this.deps.oauthProviderRegistry.get(provider).supportsReauth,
    );
    return [...providers, 'email_code'];
  }
}
