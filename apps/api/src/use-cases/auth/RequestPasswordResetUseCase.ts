import { RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IPasswordResetTokenRepository } from '#src/use-cases/ports/IPasswordResetTokenRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';
import { assertCaptcha } from '#src/use-cases/auth/assertCaptcha.js';
import { PASSWORD_RESET_TOKEN } from '#src/use-cases/constants.js';
import type {
  IRequestPasswordResetUseCase,
  RequestPasswordResetInput,
} from '#src/use-cases/auth/IRequestPasswordResetUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  passwordResetTokenRepository: IPasswordResetTokenRepository;
  emailService: IEmailService;
  passwordResetRateLimiter: IRateLimiter;
  captchaVerifier: ICaptchaVerifier;
  generateId: () => string;
  webAppOrigin: string;
}

export class RequestPasswordResetUseCase implements IRequestPasswordResetUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    // Captcha first, so a bot cannot spend a victim's per-email budget below
    // (JEF-401). A refusal says nothing about whether the account exists.
    if (input.enforceCaptcha) {
      await assertCaptcha(this.deps.captchaVerifier, input.captchaToken, input.ipAddress);
    }

    // Rate-limit by both email and IP *before* looking the account up, and by
    // the exact same amount of work regardless of outcome, so a rate-limit
    // response never reveals whether the account exists.
    const emailAllowed = await this.deps.passwordResetRateLimiter.consume(
      `password-reset:email:${input.email.toLowerCase()}`,
    );
    const ipAllowed = input.ipAddress
      ? await this.deps.passwordResetRateLimiter.consume(`password-reset:ip:${input.ipAddress}`)
      : true;
    if (!emailAllowed || !ipAllowed) {
      throw new RateLimitedError('Too many password reset requests. Try again later.');
    }

    const user = await this.deps.userRepository.findByEmail(input.email);
    // Silently no-op for unknown emails so this endpoint can't be used to enumerate accounts.
    if (!user) return;

    await this.deps.passwordResetTokenRepository.deleteAllForUser(user.id);

    const rawToken = randomBytes(PASSWORD_RESET_TOKEN.RANDOM_BYTES).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN.TTL_MS);

    await this.deps.passwordResetTokenRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${this.deps.webAppOrigin}/reset-password?token=${rawToken}`;
    try {
      await this.deps.emailService.sendPasswordReset(user.email, resetUrl);
    } catch {
      // An email-provider failure must not surface differently than the
      // silent no-op above for unknown emails — otherwise it becomes an
      // enumeration oracle (errors only ever occur for real accounts).
    }
  }
}
