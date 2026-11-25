import { RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import { normalizeEmail } from '#src/domain/user/normalizeEmail.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IPasswordResetTokenRepository } from '#src/use-cases/ports/IPasswordResetTokenRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { PASSWORD_RESET_TOKEN } from '#src/use-cases/constants.js';
import type {
  IRequestBackupEmailRecoveryUseCase,
  RequestBackupEmailRecoveryInput,
} from '#src/use-cases/auth/IRequestBackupEmailRecoveryUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  passwordResetTokenRepository: IPasswordResetTokenRepository;
  emailService: IEmailService;
  backupEmailRecoveryRateLimiter: IRateLimiter;
  generateId: () => string;
  webAppOrigin: string;
}

export class RequestBackupEmailRecoveryUseCase implements IRequestBackupEmailRecoveryUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(rawInput: RequestBackupEmailRecoveryInput): Promise<void> {
    const input = { ...rawInput, backupEmail: normalizeEmail(rawInput.backupEmail) };
    const emailAllowed = await this.deps.backupEmailRecoveryRateLimiter.consume(
      `backup-email-recovery:email:${input.backupEmail}`,
    );
    const ipAllowed = input.ipAddress
      ? await this.deps.backupEmailRecoveryRateLimiter.consume(
          `backup-email-recovery:ip:${input.ipAddress}`,
        )
      : true;
    if (!emailAllowed || !ipAllowed) {
      throw new RateLimitedError('Too many backup email recovery requests. Try again later.');
    }

    const user = await this.deps.userRepository.findByBackupEmail(input.backupEmail);
    if (!user) return;
    if (!user.backupEmailVerifiedAt) return;

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
      await this.deps.emailService.sendPasswordReset(input.backupEmail, resetUrl);
    } catch {
      // Silently swallow email failures to prevent account enumeration.
    }
  }
}
