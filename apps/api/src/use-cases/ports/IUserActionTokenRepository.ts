import type {
  UserActionToken,
  UserActionTokenPurpose,
} from '#src/domain/userActionToken/UserActionToken.js';

export interface IssueUserActionTokenData {
  id: string;
  userId: string;
  purpose: UserActionTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface IUserActionTokenRepository {
  /** Stores a token, replacing any earlier one of the same purpose for the user. */
  issue(data: IssueUserActionTokenData): Promise<UserActionToken>;
  /** The user's unused, unexpired token of this purpose, if any. */
  findLiveForUser(
    userId: string,
    purpose: UserActionTokenPurpose,
    now: Date,
  ): Promise<UserActionToken | null>;
  /** The token of this purpose with this hash, used or not. */
  findByTokenHash(
    purpose: UserActionTokenPurpose,
    tokenHash: string,
  ): Promise<UserActionToken | null>;
  /**
   * Marks the token used, only if it was not already. False means another
   * request got there first, so the caller must not act on it.
   */
  consume(id: string, usedAt: Date): Promise<boolean>;
  deleteForUser(userId: string, purpose: UserActionTokenPurpose): Promise<void>;
}
