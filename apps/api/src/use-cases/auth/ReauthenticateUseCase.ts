import { RateLimitedError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import type { IPasswordHasher } from '#src/use-cases/ports/IPasswordHasher.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { verifyTotpOrBackupCode } from '#src/use-cases/auth/verifyTotpOrBackupCode.js';
import type {
  IReauthenticateUseCase,
  ReauthenticateInput,
  ReauthenticateOutput,
} from '#src/use-cases/auth/IReauthenticateUseCase.js';

interface Deps {
  passwordHasher: IPasswordHasher;
  userRepository: IUserRepository;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
  totpRateLimiter: IRateLimiter;
  totpProvider: ITotpProvider;
}

/**
 * Re-proves an already-authenticated user's identity (password, plus a TOTP
 * code if 2FA is enabled) for step-up auth (JEF-44) — distinct from
 * LoginUseCase/LoginWithTotpUseCase, which authenticate by email for a brand
 * new session. This looks the user up by id (the caller is already
 * logged in) and doesn't touch sessions; AuthResolver re-signs tokens for
 * the existing session once this succeeds.
 */
export class ReauthenticateUseCase implements IReauthenticateUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ReauthenticateInput): Promise<ReauthenticateOutput> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
    assertHasPassword(user.passwordHash);

    const validPassword = await this.deps.passwordHasher.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.totpEnabled || !user.totpSecret) {
      return { user, totpRequired: false };
    }

    if (!input.code) {
      return { user, totpRequired: true };
    }

    const allowed = await this.deps.totpRateLimiter.consume(`totp:stepup:user:${user.id}`);
    if (!allowed) {
      throw new RateLimitedError('Too many verification attempts. Please try again later.');
    }

    const validCode = await verifyTotpOrBackupCode(
      this.deps,
      { id: user.id, totpSecret: user.totpSecret },
      input.code,
    );
    if (!validCode) {
      throw new UnauthorizedError('Invalid verification code');
    }

    return { user, totpRequired: false };
  }
}
