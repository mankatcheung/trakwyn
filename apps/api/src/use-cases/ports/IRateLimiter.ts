export interface IRateLimiter {
  /** Resolves true if the request identified by `key` is allowed, false if it should be rejected. */
  consume(key: string): Promise<boolean>;
  /**
   * Resolves true if `key` has already used up its attempts in the current
   * window, without spending one. Lets a caller count events (such as failed
   * logins) with `consume` and branch on the total before the next one.
   */
  isLimited(key: string): Promise<boolean>;
}
