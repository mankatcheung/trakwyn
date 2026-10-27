import { NotFoundError, RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { EMAIL_VERIFICATION_TOKEN } from '#src/use-cases/constants.js';
import type { ISendEmailVerificationUseCase } from '#src/use-cases/auth/ISendEmailVerificationUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  emailVerificationTokenRepository: IEmailVerificationTokenRepository;
  emailService: IEmailService;
  emailVerificationUserRateLimiter: IRateLimiter;
  emailVerificationGlobalRateLimiter: IRateLimiter;
  generateId: () => string;
  webAppOrigin: string;
}

export class SendEmailVerificationUseCase implements ISendEmailVerificationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<void> {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    // Nothing to verify; a stale "resend" from a second tab must not mail a live link.
    if (user.emailVerifiedAt) return;

    // Checked before the old token is deleted, so a throttled request leaves
    // the link already in the user's inbox working. The per-user limit goes
    // first so one account's retries don't spend the global budget.
    const userAllowed = await this.deps.emailVerificationUserRateLimiter.consume(
      `email-verification:user:${user.id}`,
    );
    const globalAllowed =
      userAllowed &&
      (await this.deps.emailVerificationGlobalRateLimiter.consume('email-verification:global'));
    if (!userAllowed || !globalAllowed) {
      throw new RateLimitedError('Too many verification emails. Try again later.');
    }

    await this.deps.emailVerificationTokenRepository.deleteAllForUser(user.id);

    const rawToken = randomBytes(EMAIL_VERIFICATION_TOKEN.RANDOM_BYTES).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN.TTL_MS);

    await this.deps.emailVerificationTokenRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const verifyUrl = `${this.deps.webAppOrigin}/verify-email?token=${rawToken}`;
    await this.deps.emailService.sendEmailVerification(user.email, verifyUrl);
  }
}
