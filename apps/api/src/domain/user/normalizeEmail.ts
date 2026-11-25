/**
 * The one form an account email is stored, looked up and rate-limited in
 * (JEF-692): trimmed and lowercased, so `Jeff@Example.com ` and
 * `jeff@example.com` are the same account. Provider rules such as dots or
 * `+tag` are left alone.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
