import { createHash } from 'node:crypto';

/**
 * Fingerprint of the resume text a match was scored against. Comparing hashes,
 * rather than `updatedAt`, means a rename or a save that changes nothing does
 * not make a match look out of date, and an edit that is undone clears it.
 */
export function hashResumeText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}
