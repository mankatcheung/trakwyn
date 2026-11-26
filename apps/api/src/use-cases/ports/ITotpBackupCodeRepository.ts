import type { TotpBackupCode } from '#src/domain/totpBackupCode/TotpBackupCode.js';

export interface ITotpBackupCodeRepository {
  create(data: { id: string; userId: string; codeHash: string }): Promise<TotpBackupCode>;
  findByCodeHash(codeHash: string): Promise<TotpBackupCode | null>;
  /** False when the code was already used, so one code cannot be spent twice. */
  markUsed(id: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}
