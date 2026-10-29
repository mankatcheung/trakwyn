export interface RequestEmailChangeInput {
  userId: string;
  /** Required when the account has a password; one without steps up instead (JEF-463). */
  currentPassword?: string | null;
  newEmail: string;
  /** Epoch-ms of the caller's session's last full authentication — see `REAUTH` in constants.ts. */
  authTime?: number | null;
}

export interface IRequestEmailChangeUseCase {
  execute(input: RequestEmailChangeInput): Promise<void>;
}
