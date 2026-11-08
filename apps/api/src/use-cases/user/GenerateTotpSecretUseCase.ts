import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import QRCode from 'qrcode';
import type { IPasswordHasher } from '#src/use-cases/ports/IPasswordHasher.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import type {
  IGenerateTotpSecretUseCase,
  GenerateTotpSecretInput,
  TotpSetup,
} from '#src/use-cases/user/IGenerateTotpSecretUseCase.js';

interface Deps {
  passwordHasher: IPasswordHasher;
  userRepository: IUserRepository;
  totpProvider: ITotpProvider;
}

export class GenerateTotpSecretUseCase implements IGenerateTotpSecretUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateTotpSecretInput): Promise<TotpSetup> {
    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    if (user.totpEnabled) {
      throw new ConflictError('Two-factor authentication is already enabled');
    }

    assertHasPassword(user.passwordHash);
    const validPassword = await this.deps.passwordHasher.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid password');
    }

    const secret = this.deps.totpProvider.generateSecret();
    const otpauthUrl = this.deps.totpProvider.getOtpauthUrl(secret, user.email);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.deps.userRepository.update(input.userId, {
      totpSecret: this.deps.totpProvider.encryptSecret(secret),
    });

    return { secret, otpauthUrl, qrCodeDataUrl };
  }
}
