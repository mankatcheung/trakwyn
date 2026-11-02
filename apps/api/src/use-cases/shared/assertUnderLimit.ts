import { QuotaExceededError, ValidationError } from '#src/use-cases/errors/DomainError.js';

/**
 * The `COUNT(*)` pre-check behind the per-user and per-application caps in
 * `CONTENT_LIMITS` (JEF-339). `count` is how many rows exist before the new one
 * is added, so a count equal to the limit is already full.
 *
 * Not race-safe by design: two concurrent creates can both pass and leave the
 * resource one over. See the note on `CONTENT_LIMITS` for why that is accepted.
 */
export function assertUnderLimit(count: number, limit: number, noun: string): void {
  if (count >= limit) {
    throw new QuotaExceededError(`You have reached the maximum of ${limit} ${noun}`);
  }
}

/**
 * Like `assertUnderLimit`, for a batch: refuses when adding `incoming` rows to
 * the `existing` ones would pass `limit`, and says how many still fit.
 */
export function assertRoomFor(
  existing: number,
  incoming: number,
  limit: number,
  noun: string,
): void {
  if (existing + incoming > limit) {
    const room = Math.max(limit - existing, 0);
    throw new QuotaExceededError(
      `You have reached the maximum of ${limit} ${noun}; there is room for ${room} more`,
    );
  }
}

/** Refuses text longer than `max` characters. Never truncates (JEF-339). */
export function assertMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw new ValidationError(`${label} must be at most ${max} characters`);
  }
}
