/**
 * What a `UserActionToken` unlocks (JEF-463). Each purpose has at most one live
 * token per user: issuing a new one replaces the old.
 *
 * - `step_up_code`: the 6-digit code emailed to an account with no password, so
 *   it can re-authenticate for a sensitive change.
 * - `account_deletion_confirm`: the link that turns a deletion request into a
 *   scheduled deletion.
 * - `account_deletion_cancel`: the link in the "scheduled" email that cancels
 *   it, valid for the whole grace period and usable without signing in.
 */
export const USER_ACTION_TOKEN_PURPOSES = [
  'step_up_code',
  'account_deletion_confirm',
  'account_deletion_cancel',
] as const;

export type UserActionTokenPurpose = (typeof USER_ACTION_TOKEN_PURPOSES)[number];

export interface UserActionToken {
  id: string;
  userId: string;
  purpose: UserActionTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
