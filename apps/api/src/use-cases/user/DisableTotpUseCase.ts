import { NotFoundError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import type {
  IDisableTotpUseCase,
  DisableTotpInput,
} from '#src/use-cases/user/IDisableTotpUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class DisableTotpUseCase implements IDisableTotpUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DisableTotpInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    assertHasPassword(user.passwordHash);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid password');

    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(input.userId, {
        totpEnabled: false,
        totpSecret: null,
      });
      await this.deps.totpBackupCodeRepository.deleteAllForUser(input.userId);

      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId: input.userId,
        eventType: 'totp_disabled',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    });
  }
}
