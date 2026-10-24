/** `BILLING_LIVE_FROM` as a date, or null when unset. A value that is not a date throws: a typo must not silently re-open the founder price. */
export function parseBillingLiveFrom(raw: string | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`BILLING_LIVE_FROM must be an ISO date, got "${value}"`);
  }
  return date;
}
