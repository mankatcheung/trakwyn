/** The key the API stores a role's "no" under; a requirement is sent as shown. */
export const roleGapKey = (workExperienceId: string): string => `role:${workExperienceId}`;

/** The API's limit on a work experience description; an answer that would pass it is refused here. */
export const ROLE_DESCRIPTION_MAX_CHARS = 2000;

/** The role's description with the new line added as its own bullet. */
export function appendToDescription(description: string | null, line: string): string {
  const bullet = `- ${line.trim().replace(/^[-•*]\s*/, '')}`;
  const existing = description?.trimEnd() ?? '';
  return existing ? `${existing}\n${bullet}` : bullet;
}
