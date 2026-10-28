import {
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IBackupEmailVerificationTokenRepository } from '#src/use-cases/ports/IBackupEmailVerificationTokenRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { BACKUP_EMAIL_VERIFICATION_TOKEN } from '#src/use-cases/constants.js';
import { confirmIdentity } from '#src/use-cases/auth/confirmIdentity.js';
import type {
  IRequestAddBackupEmailUseCase,
  RequestAddBackupEmailInput,
} from '#src/use-cases/user/IRequestAddBackupEmailUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  backupEmailVerificationTokenRepository: IBackupEmailVerificationTokenRepository;
  emailService: IEmailService;
  requestAddBackupEmailRateLimiter: IRateLimiter;
  generateId: () => string;
  webAppOrigin: string;
}

export class RequestAddBackupEmailUseCase implements IRequestAddBackupEmailUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RequestAddBackupEmailInput): Promise<void> {
    const allowedByUser = await this.deps.requestAddBackupEmailRateLimiter.consume(
      `request-add-backup-email:user:${input.userId}`,
    );
    if (!allowedByUser) {
      throw new RateLimitedError('Too many backup email requests. Try again later.');
    }

    const allowedByEmail = await this.deps.requestAddBackupEmailRateLimiter.consume(
      `request-add-backup-email:email:${input.backupEmail}`,
    );
    if (!allowedByEmail) {
      throw new RateLimitedError('Too many backup email requests. Try again later.');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    await confirmIdentity(user, input);

    if (input.backupEmail === user.email) {
      throw new ValidationError('Backup email must be different from your current email');
    }

    // Check if backup email is already used by another user. Silently continue
    // either way to prevent email enumeration.
    const existingUser = await this.deps.userRepository.findByBackupEmail(input.backupEmail);
    if (existingUser && existingUser.id !== user.id) {
      // Email already in use — treat as success to prevent enumeration.
      return;
    }

    // Clear any previous unconfirmed backup email tokens for this user.
    await this.deps.backupEmailVerificationTokenRepository.deleteAllForUser(user.id);

    const rawToken = randomBytes(BACKUP_EMAIL_VERIFICATION_TOKEN.RANDOM_BYTES).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + BACKUP_EMAIL_VERIFICATION_TOKEN.TTL_MS);

    await this.deps.backupEmailVerificationTokenRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      tokenHash,
      newBackupEmail: input.backupEmail,
      expiresAt,
    });

    const verifyUrl = `${this.deps.webAppOrigin}/confirm-backup-email?token=${rawToken}`;
    await this.deps.emailService.sendBackupEmailVerification(input.backupEmail, verifyUrl);
  }
}
