import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IOAuthAccountRepository } from '#src/use-cases/ports/IOAuthAccountRepository.js';
import type { IOAuthProviderRegistry } from '#src/use-cases/ports/IOAuthProviderRegistry.js';
import type {
  ILoginOrSignupWithOAuthUseCase,
  LoginOrSignupWithOAuthInput,
  LoginOrSignupWithOAuthOutput,
} from '#src/use-cases/oauth/ILoginOrSignupWithOAuthUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  oauthAccountRepository: IOAuthAccountRepository;
  oauthProviderRegistry: IOAuthProviderRegistry;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class LoginOrSignupWithOAuthUseCase implements ILoginOrSignupWithOAuthUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: LoginOrSignupWithOAuthInput): Promise<LoginOrSignupWithOAuthOutput> {
    const provider = this.deps.oauthProviderRegistry.get(input.provider);
    const profile = await provider.exchangeCodeForProfile(
      input.code,
      input.redirectUri,
      input.codeVerifier,
    );

    const existingLink = await this.deps.oauthAccountRepository.findByProvider(
      input.provider,
      profile.providerAccountId,
    );
    if (existingLink) {
      const user = await this.deps.userRepository.findById(existingLink.userId);
      if (!user) {
        throw new NotFoundError('Linked account not found');
      }
      return { user, isNewUser: false };
    }

    if (!profile.email || !profile.emailVerified) {
      throw new ValidationError(
        'Your provider did not share a verified email address, so an account cannot be created automatically.',
      );
    }

    const email = profile.email;
    const existingUser = await this.deps.userRepository.findByEmail(email);
    if (existingUser) {
      // Deliberately not auto-linking: silently attaching a new OAuth identity
      // to an existing account based only on a matching email is a known
      // account-takeover vector. The user must log in with their existing
      // method first and link this provider explicitly from settings.
      throw new ConflictError(
        'An account with this email already exists. Log in and link this provider from account settings.',
      );
    }

    return runInTransaction(this.deps.transactionManager, async () => {
      const user = await this.deps.userRepository.create({
        id: this.deps.generateId(),
        email,
        passwordHash: null,
        name: profile.name,
        emailVerifiedAt: new Date(),
      });
      await this.deps.oauthAccountRepository.create({
        id: this.deps.generateId(),
        userId: user.id,
        provider: input.provider,
        providerAccountId: profile.providerAccountId,
        email,
      });

      return { user, isNewUser: true };
    });
  }
}
