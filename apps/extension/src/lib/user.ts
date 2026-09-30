import type { CurrentUser } from './api';

type UserIdentity = Pick<CurrentUser, 'name' | 'email'>;

/** The user's name, trimmed, or `null` when they haven't set one. */
function trimmedName(user: UserIdentity): string | null {
  return user.name?.trim() || null;
}

/** The name to lead with: the user's name, or their email when they have none. */
export function displayName(user: UserIdentity): string {
  return trimmedName(user) ?? user.email;
}

/** Whether a separate email line is worth showing under the display name. */
export function hasDistinctName(user: UserIdentity): boolean {
  return trimmedName(user) !== null;
}

/** Up to two initials for the avatar fallback, from the name or else the email. */
export function initials(user: UserIdentity): string {
  const words = trimmedName(user)?.split(/\s+/) ?? [];
  if (words.length === 0) return user.email.charAt(0).toUpperCase();
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}
