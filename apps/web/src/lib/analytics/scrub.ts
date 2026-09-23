/**
 * The `before_send` scrubber every PostHog event passes through (JEF-349).
 *
 * Trakwyn's pages carry company names, job titles, notes, salaries and the
 * user's own email, and an error tracker is the easiest place to leak them
 * by accident: an exception message quotes the value that broke, and a
 * GraphQL failure carries the variables that produced it. The same rule the
 * API adopted for its logs (JEF-348) applies here — the payload says what
 * happened and where, never what the user typed.
 *
 * Two mechanisms, deliberately both:
 *
 *  - a **deny-list of property names**, which removes a whole value
 *    regardless of shape (`variables`, `salary`, `description`);
 *  - **pattern redaction inside every remaining string**, which catches the
 *    same data arriving somewhere we did not anticipate — an email quoted
 *    in an exception message, a JWT in a stack frame's URL.
 *
 * A deny-list alone would be a list of the places we happened to think of.
 *
 * Kept in step with apps/mobile/src/lib/analytics/scrub.ts, which is the
 * same rule for the other SDK — mirrored rather than shared, following the
 * repo's existing convention for the handful of values both clients need
 * (`CHAT_MESSAGE_MAX_CHARS`, `ERROR_CODES`); there is no shared runtime
 * package between a Vite app and a React Native app to put it in.
 */

/** Replaces a denied property's value, so the key's presence is still visible in PostHog. */
export const REDACTED = '[redacted]';

/**
 * Property names whose values never leave the device, matched
 * case-insensitively against the whole key.
 *
 * `variables` is the important one: a single GraphQL failure's variables
 * hold the job description, the salary and the note body all at once.
 */
const DENIED_KEYS = new Set(
  [
    // Credentials and identity
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'cookie',
    'apiKey',
    'totpSecret',
    'backupCodes',
    'email',
    'backupEmail',
    'name',
    'fullName',
    // Request payloads
    'variables',
    'body',
    // Application content
    'description',
    'jobDescription',
    'notes',
    'note',
    'content',
    'coverLetter',
    'resume',
    'message',
    'messages',
    // Compensation
    'salary',
    'salaryMin',
    'salaryMax',
    'compensation',
  ].map((key) => key.toLowerCase()),
);

/**
 * Anything longer than this is free text rather than an identifier, and free
 * text in this app is user content. Clipping rather than dropping keeps a
 * long-but-harmless value (a stack frame, a URL) readable.
 */
const MAX_STRING_CHARS = 500;

/** Nested objects past this depth are dropped rather than walked — a cycle-free bound, not a size limit. */
const MAX_DEPTH = 6;

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** A JWT: three base64url segments, the first of which always starts `eyJ` ("{"). */
const JWT_PATTERN = /\beyJ[\w-]*\.[\w-]+\.[\w-]*/g;
const BEARER_PATTERN = /\bBearer\s+[\w\-._~+/]+=*/gi;
/**
 * A URL's query string and fragment. `?token=…`, `?returnTo=/applications/…`
 * and `#access_token=…` all arrive here from redirects and stack frames.
 */
const URL_QUERY_PATTERN = /(https?:\/\/[^\s?#]+)[?#][^\s]*/g;

/**
 * Redacts the patterns above from a single string and clips what is left.
 * Order matters: JWTs and bearer tokens are removed before the URL rule, so
 * a token in a query string is redacted rather than merely truncated away.
 */
export function scrubString(value: string): string {
  const redacted = value
    .replace(JWT_PATTERN, '[redacted-token]')
    .replace(BEARER_PATTERN, 'Bearer [redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(URL_QUERY_PATTERN, '$1?[redacted]');
  return redacted.length > MAX_STRING_CHARS
    ? `${redacted.slice(0, MAX_STRING_CHARS)}…[clipped]`
    : redacted;
}

function isDenied(key: string): boolean {
  return DENIED_KEYS.has(key.toLowerCase());
}

/**
 * Walks an arbitrary value, dropping denied keys and redacting every string
 * it keeps. Non-plain values (functions, class instances) are reduced to
 * their type name: PostHog would serialise them anyway, and what comes out
 * of that is exactly the kind of thing this file exists to avoid shipping
 * unexamined.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry, depth + 1));
  if (typeof value === 'object') {
    // Anything that isn't a plain object or a null-prototype one — a Date, an
    // Error, a class instance — has no enumerable shape worth walking.
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== null && prototype !== Object.prototype) return REDACTED;

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = isDenied(key) ? REDACTED : scrubValue(entry, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

/** The shape of a PostHog capture as `before_send` sees it — only the part this scrubber touches. */
export interface ScrubbableEvent {
  properties?: Record<string, unknown>;
}

/**
 * The `before_send` hook itself. Returns the event (mutated in place, which
 * is what PostHog's own examples do) rather than a copy, and passes `null`
 * straight through — an earlier hook in the chain may already have dropped
 * the event.
 *
 * The one value exempt from the deny-list is the top-level `token`: posthog-js
 * puts the public `phc_…` project key there, and ingestion uses it to decide
 * which project the event belongs to. Redacted, every request still returns
 * 200 and no event ever appears. A `token` anywhere deeper is still denied.
 */
export function scrubEvent<T extends ScrubbableEvent | null>(event: T): T {
  if (!event?.properties) return event;
  const projectKey = event.properties.token;
  const scrubbed = scrubValue(event.properties) as Record<string, unknown>;
  event.properties = typeof projectKey === 'string' ? { ...scrubbed, token: projectKey } : scrubbed;
  return event;
}
