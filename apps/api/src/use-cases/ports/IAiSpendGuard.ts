/**
 * The daily breaker on hosted AI spend (JEF-449): one budget for the
 * platform's whole day, across every user.
 */
export interface IAiSpendGuard {
  /**
   * Refuses a hosted call. Throws `AiTemporarilyUnavailableError` when the
   * day's budget is spent **or the spend cannot be read** — it fails closed,
   * unlike the session blocklist, because a limit that stops applying under
   * load is not a limit.
   */
  assertWithinBudget(): Promise<void>;
  /** Adds one finished hosted call's cost to today's spend. Never throws. */
  record(costMicros: number): Promise<void>;
}
