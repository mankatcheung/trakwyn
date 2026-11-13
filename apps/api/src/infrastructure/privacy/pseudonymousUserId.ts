import { createHash } from 'node:crypto';

/** Hex characters kept from the hash: enough to tell users apart, too short to mistake for an id. */
const USER_HASH_LENGTH = 16;

/**
 * A stable, one-way stand-in for a Trakwyn user id (JEF-497, JEF-566). Gateway
 * metadata and PostHog AI events both carry it, so a row in either can be
 * matched to the other, and Trakwyn can recompute it from a user id to find
 * whose row it is, while neither vendor holds an email or a real id.
 */
export function pseudonymousUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, USER_HASH_LENGTH);
}

/**
 * The same for a conversation id (JEF-568): the `$ai_session_id` PostHog groups
 * a chat's turns by. Prefixed so it can never equal a user's hash, and Trakwyn
 * can still recompute it from a conversation id to find the session.
 */
export function pseudonymousSessionId(sessionKey: string): string {
  return createHash('sha256')
    .update(`session:${sessionKey}`)
    .digest('hex')
    .slice(0, USER_HASH_LENGTH);
}
