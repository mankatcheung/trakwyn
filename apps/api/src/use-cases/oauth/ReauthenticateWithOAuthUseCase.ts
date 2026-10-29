import { ForbiddenError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import type { User } from '#src/domain/user/User.js';
import type { IOAuthAccountRepository } from '#src/use-cases/ports/IOAuthAccountRepository.js';
import type { IOAuthProviderRegistry } from '#src/use-cases/ports/IOAuthProviderRegistry.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import { REAUTH } from '#src/use-cases/constants.js';

export interface ReauthenticateWithOAuthInput {
  userId: string;
  provider: OAuthProviderName;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

interface Deps {
  oauthProviderRegistry: IOAuthProviderRegistry;
  oauthAccountRepository: IOAuthAccountRepository;
  userRepository: IUserRepository;
  now?: () => Date;
}

/**
 * A step-up through the provider the user signs in with (JEF-463): the
 * OAuth counterpart of `ReauthenticateUseCase`'s password check. It proves
 * the provider authenticated *this* account just now, not merely that a
 * session there is still alive, which is why only a provider that reports
 * `auth_time` can serve it.
 *
 * Like `ReauthenticateUseCase` it touches no session: the caller re-signs the
 * tokens of the session that started the flow once this succeeds.
 */
export class ReauthenticateWithOAuthUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ReauthenticateWithOAuthInput): Promise<User> {
    const provider = this.deps.oauthProviderRegistry.get(input.provider);
    if (!provider.supportsReauth) {
      throw new ForbiddenError('This sign-in method cannot confirm your identity');
    }

    const profile = await provider.exchangeCodeForProfile(
      input.code,
      input.redirectUri,
      input.codeVerifier,
      { requireAuthTime: true },
    );

    // The provider account must be the one linked to this user: anyone can
    // finish a Google sign-in, so a fresh sign-in to some other account
    // proves nothing about the person holding this session.
    const account = await this.deps.oauthAccountRepository.findByProvider(
      input.provider,
      profile.providerAccountId,
    );
    if (!account || account.userId !== input.userId) {
      throw new UnauthorizedError('That account is not linked to you');
    }

    const now = (this.deps.now ?? (() => new Date()))();
    const authTime = profile.authTime;
    if (!authTime || now.getTime() - authTime.getTime() > REAUTH.OIDC_MAX_AUTH_AGE_MS) {
      throw new UnauthorizedError('Sign in again to confirm it is you');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new UnauthorizedError('Invalid credentials');
    return user;
  }
}
