import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import { createHash, randomBytes } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import { TOTP_BACKUP_CODES } from '#src/use-cases/constants.js';
import type {
  IConfirmTotpSetupUseCase,
  ConfirmTotpSetupInput,
  ConfirmTotpSetupOutput,
} from '#src/use-cases/user/IConfirmTotpSetupUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
  totpProvider: ITotpProvider;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class ConfirmTotpSetupUseCase implements IConfirmTotpSetupUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConfirmTotpSetupInput): Promise<ConfirmTotpSetupOutput> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    if (user.totpEnabled) {
      throw new ConflictError('Two-factor authentication is already enabled');
    }
    if (!user.totpSecret) {
      throw new ConflictError('No two-factor setup in progress');
    }

    const secret = this.deps.totpProvider.decryptSecret(user.totpSecret);
    const valid = await this.deps.totpProvider.verifyCode(secret, input.code);
    if (!valid) {
      throw new UnauthorizedError('Invalid verification code');
    }

    const backupCodes = Array.from({ length: TOTP_BACKUP_CODES.COUNT }, () =>
      randomBytes(TOTP_BACKUP_CODES.RANDOM_BYTES).toString('hex'),
    );
    // Enabling 2FA without its backup codes would lock the user out of the account,
    // so the flag, the codes and the audit row commit together or not at all.
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(input.userId, { totpEnabled: true });
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
        eventType: 'totp_enabled',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    });

    return { backupCodes };
  }
}
