import type { ResumeContact } from '#src/domain/resume/ResumeContent.js';
import type { User } from '#src/domain/user/User.js';

/**
 * The resume header for a user (JEF-526): their name and account email. The
 * account email, not the backup, because it is verified and always present.
 * A missing user yields no header rather than failing the generation.
 */
export function buildResumeContact(user: Pick<User, 'name' | 'email'> | null): ResumeContact {
  return { name: user?.name ?? null, email: user?.email ?? null, details: [] };
}
