import type { LlmProviderError } from '#src/use-cases/errors/DomainError.js';

/**
 * What Cloudflare Workers AI answers with once the day's free allocation is
 * spent: HTTP 429, code 4006, "you have used up your daily free allocation of
 * 10,000 neurons". The app maps it to `rate_limited` (failover and circuits
 * depend on that), so the eval runner reads the provider's own words instead.
 */
export const CLOUDFLARE_DAILY_QUOTA = {
  code: '4006',
  phrase: 'daily free allocation',
  /** When Cloudflare gives the allocation back. */
  resetsAt: '00:00 UTC',
} as const;

/**
 * A quota stop: retrying the next case cannot succeed until the allocation
 * resets, so the runner stops the target instead of failing every case with a
 * message that reads like a model score of 0%. An ordinary rate limit is not one.
 */
export function isQuotaStop(error: LlmProviderError): boolean {
  if (error.kind === 'quota') return true;
  if (error.kind !== 'rate_limited' || error.detail === null) return false;
  const detail = error.detail.toLowerCase();
  return (
    detail.includes(CLOUDFLARE_DAILY_QUOTA.code) || detail.includes(CLOUDFLARE_DAILY_QUOTA.phrase)
  );
}
