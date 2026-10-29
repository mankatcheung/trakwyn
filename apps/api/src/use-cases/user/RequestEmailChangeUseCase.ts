import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { EMAIL_VERIFICATION_TOKEN } from '#src/use-cases/constants.js';
import { confirmIdentity } from '#src/use-cases/auth/confirmIdentity.js';
import type {
  IRequestEmailChangeUseCase,
  RequestEmailChangeInput,
} from '#src/use-cases/user/IRequestEmailChangeUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  emailVerificationTokenRepository: IEmailVerificationTokenRepository;
  emailService: IEmailService;
  requestEmailChangeRateLimiter: IRateLimiter;
  generateId: () => string;
  webAppOrigin: string;
}

export class RequestEmailChangeUseCase implements IRequestEmailChangeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RequestEmailChangeInput): Promise<void> {
    // Rate-limit by user ID to prevent abuse of email change requests
    const allowed = await this.deps.requestEmailChangeRateLimiter.consume(
      `request-email-change:user:${input.userId}`,
    );
    if (!allowed) {
      throw new RateLimitedError('Too many email change requests. Try again later.');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    await confirmIdentity(user, input);

    const existing = await this.deps.userRepository.findByEmail(input.newEmail);
    if (existing && existing.id !== input.userId) {
      throw new ConflictError('Email already in use');
    }

    // The email itself is not changed here — only a confirmation link is sent
    // to the new address. The change only takes effect once that link is
    // clicked (ConfirmEmailChangeUseCase), so a typo'd address can never lock
    // the user out of their account.
    await this.deps.emailVerificationTokenRepository.deleteAllForUser(user.id);

    const rawToken = randomBytes(EMAIL_VERIFICATION_TOKEN.RANDOM_BYTES).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN.TTL_MS);

    await this.deps.emailVerificationTokenRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      tokenHash,
      newEmail: input.newEmail,
      expiresAt,
    });

    const confirmUrl = `${this.deps.webAppOrigin}/confirm-email-change?token=${rawToken}`;
    await this.deps.emailService.sendEmailVerification(input.newEmail, confirmUrl);
  }
}
