import { createHash } from 'node:crypto';

/**
 * Fingerprint of the job description a match was scored against (JEF-450), the
 * counterpart of `hashResumeText`. Whitespace is collapsed so reflowing the
 * text does not look like an edit.
 */
export function hashJobDescription(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
}
