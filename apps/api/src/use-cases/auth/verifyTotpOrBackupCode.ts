import { createHash } from 'crypto';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';

interface Deps {
  totpProvider: ITotpProvider;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
}

/** Verifies a 6-digit TOTP code against the user's secret, falling back to a hashed single-use backup code. */
export async function verifyTotpOrBackupCode(
  deps: Deps,
  user: { id: string; totpSecret: string },
  code: string,
): Promise<boolean> {
  // TOTP codes are always 6 digits — anything else can only be a backup code.
  const isTotpFormat = /^\d{6}$/.test(code);
  const secret = deps.totpProvider.decryptSecret(user.totpSecret);
  const validTotp = isTotpFormat ? await deps.totpProvider.verifyCode(secret, code) : false;
  if (validTotp) return true;

  const codeHash = createHash('sha256').update(code).digest('hex');
  const backupCode = await deps.totpBackupCodeRepository.findByCodeHash(codeHash);
  const validBackupCode = backupCode && backupCode.userId === user.id && !backupCode.usedAt;
  if (!validBackupCode) return false;

  // The check above can pass for two requests at once; only the update decides.
  return deps.totpBackupCodeRepository.markUsed(backupCode.id);
}
