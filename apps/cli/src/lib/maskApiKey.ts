import { API_TOKEN_PREFIX } from '../constants.js';

/** Characters of the secret shown at the end, enough to tell two keys apart. */
const VISIBLE_TAIL_CHARS = 4;
/** Keys no longer than this much past the prefix show no tail at all. */
const MIN_SECRET_CHARS_TO_SHOW_TAIL = VISIBLE_TAIL_CHARS * 2;

/**
 * Display form of an API key for terminal output (JEF-484): the token prefix
 * and the last few characters, never the random characters that follow the
 * prefix.
 */
export function maskApiKey(key: string): string {
  const hasPrefix = key.startsWith(API_TOKEN_PREFIX);
  const head = hasPrefix ? API_TOKEN_PREFIX : '';
  const secret = hasPrefix ? key.slice(API_TOKEN_PREFIX.length) : key;
  const tail =
    secret.length >= MIN_SECRET_CHARS_TO_SHOW_TAIL ? secret.slice(-VISIBLE_TAIL_CHARS) : '';
  return `${head}…${tail}`;
}
