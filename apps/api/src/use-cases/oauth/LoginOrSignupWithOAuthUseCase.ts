import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { User } from '#src/domain/user/User.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
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
  sessionRepository: ISessionRepository;
  emailVerificationTokenRepository: IEmailVerificationTokenRepository;
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
    if (existingUser?.emailVerifiedAt) {
      // Deliberately not auto-linking: silently attaching a new OAuth identity
      // to an existing account based only on a matching email is a known
      // account-takeover vector. The user must log in with their existing
      // method first and link this provider explicitly from settings.
      throw new ConflictError(
        'An account with this email already exists. Log in and link this provider from account settings.',
      );
    }
    if (existingUser) {
      return this.takeOverUnverifiedAccount(
        existingUser,
        input.provider,
        profile.providerAccountId,
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

  /**
   * An account nobody has proved they own holds this email (JEF-438): someone
   * registered it with a password and never verified it. The provider has just
   * shown that the person signing in does own the address, so the account is
   * handed to them. Anything the squatter set up is removed so none of it
   * survives the hand-over (the password, 2FA, a backup address for recovery,
   * open sessions and pending verification links); otherwise registering a
   * victim's address first would leave a back door into their account.
   */
  private async takeOverUnverifiedAccount(
    squatted: User,
    provider: LoginOrSignupWithOAuthInput['provider'],
    providerAccountId: string,
  ): Promise<LoginOrSignupWithOAuthOutput> {
    const user = await runInTransaction(this.deps.transactionManager, async () => {
      const reset = await this.deps.userRepository.update(squatted.id, {
        passwordHash: null,
        totpSecret: null,
        totpEnabled: false,
        backupEmail: null,
        backupEmailVerifiedAt: null,
        emailVerifiedAt: new Date(),
      });
      await this.deps.sessionRepository.revokeAllForUser(squatted.id);
      await this.deps.emailVerificationTokenRepository.deleteAllForUser(squatted.id);
      await this.deps.oauthAccountRepository.create({
        id: this.deps.generateId(),
        userId: squatted.id,
        provider,
        providerAccountId,
        email: squatted.email,
      });
      return reset;
    });
    return { user, isNewUser: false };
  }
}
