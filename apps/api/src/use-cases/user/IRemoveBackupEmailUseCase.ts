export interface RemoveBackupEmailInput {
  userId: string;
  /** Required when the account has a password; one without steps up instead (JEF-463). */
  currentPassword?: string | null;
  /** Epoch-ms of the caller's session's last full authentication — see `REAUTH` in constants.ts. */
  authTime?: number | null;
}

export interface IRemoveBackupEmailUseCase {
  execute(input: RemoveBackupEmailInput): Promise<void>;
}
