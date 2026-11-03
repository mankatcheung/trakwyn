import { createHash } from 'node:crypto';

const BUCKETS = 100;

/** A stable 0-99 bucket for a user id: the same id lands in the same bucket on every request and revision. */
export function rolloutBucket(userId: string): number {
  const digest = createHash('sha256').update(userId).digest();
  return digest.readUInt32BE(0) % BUCKETS;
}

/** `HOSTED_AI_ROLLOUT_PERCENT`: unset or blank is 100 (everyone); junk or out of range clamps to 0 so a typo never widens the rollout. */
export function parseRolloutPercent(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return BUCKETS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(BUCKETS, Math.max(0, n));
}

export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isInHostedAiRollout(
  userId: string,
  percentRaw: string | undefined,
  allowlistRaw: string | undefined,
): boolean {
  if (parseAllowlist(allowlistRaw).has(userId)) return true;
  return rolloutBucket(userId) < parseRolloutPercent(percentRaw);
}
