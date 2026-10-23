import {
  ConflictError,
  NotFoundError,
  StepUpRequiredError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import { TOTP_BACKUP_CODES } from '#src/use-cases/constants.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';
import type {
  IRegenerateTotpBackupCodesUseCase,
  RegenerateTotpBackupCodesInput,
  RegenerateTotpBackupCodesOutput,
} from './IRegenerateTotpBackupCodesUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class RegenerateTotpBackupCodesUseCase implements IRegenerateTotpBackupCodesUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RegenerateTotpBackupCodesInput): Promise<RegenerateTotpBackupCodesOutput> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    if (!user.totpEnabled) {
      throw new ConflictError('Two-factor authentication is not enabled');
    }
    assertHasPassword(user.passwordHash);

    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Invalid password');
    }
    if (!isSessionFresh(input.authTime)) {
      throw new StepUpRequiredError('Please verify your identity again to continue.');
    }

    const backupCodes = Array.from({ length: TOTP_BACKUP_CODES.COUNT }, () =>
      randomBytes(TOTP_BACKUP_CODES.RANDOM_BYTES).toString('hex'),
    );
    // Delete-then-create must be atomic: a failure between them would leave the
    // user with 2FA on and no backup codes at all.
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.totpBackupCodeRepository.deleteAllForUser(input.userId);
      await Promise.all(
        backupCodes.map((code) =>
          this.deps.totpBackupCodeRepository.create({
            id: this.deps.generateId(),
            userId: input.userId,
            codeHash: createHash('sha256').update(code).digest('hex'),
          }),
        ),
      );

      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId: input.userId,
        eventType: 'totp_backup_codes_regenerated',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    });

    return { backupCodes };
  }
}
