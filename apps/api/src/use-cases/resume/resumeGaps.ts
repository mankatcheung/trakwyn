import type { WorkExperience } from '#src/domain/workExperience/WorkExperience.js';
import { RESUME_GAPS } from '#src/use-cases/constants.js';
import { profileSkillMatcher } from '#src/use-cases/resume/resumeGrounding.js';
import type { UserProfile } from '#src/use-cases/shared/userProfile.js';

/*
 * What would make a resume for this application stronger, as questions for the
 * user (JEF-594). The model may not invent a skill or a number, so the only
 * honest way to add one is to ask, and to save the answer to the profile.
 *
 * Pure: no model call and no I/O. The use case supplies the saved posting
 * keywords, the profile and what the user already dismissed.
 */

/** A role with no figure in its description: nothing a bullet could quantify. */
export interface RoleWithoutMetrics {
  workExperienceId: string;
  company: string;
  title: string;
  /** The description as stored, so a client can append to it. */
  description: string | null;
}

export interface ResumeGaps {
  /** False when the posting's requirements have not been read, so there is nothing to compare. */
  requirementsRead: boolean;
  /** Keywords the posting asks for that the profile neither lists nor mentions. */
  requirementGaps: string[];
  rolesWithoutMetrics: RoleWithoutMetrics[];
}

const ROLE_KEY_PREFIX = 'role:';

/** The dismissal key for a role's "add a number" question. */
export const roleGapKey = (workExperienceId: string): string =>
  `${ROLE_KEY_PREFIX}${workExperienceId}`;

/** The dismissal key for a requirement: case and spacing do not make it a new question. */
export const requirementGapKey = (requirement: string): string =>
  requirement.trim().replace(/\s+/g, ' ').toLowerCase();

/** Whichever key a client sent, in its stored form. */
export function normaliseGapKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.startsWith(ROLE_KEY_PREFIX) ? trimmed : requirementGapKey(trimmed);
}

const mostRecentFirst = (a: WorkExperience, b: WorkExperience): number => {
  const end = (role: WorkExperience) =>
    role.endDate ? new Date(role.endDate).getTime() : Number.POSITIVE_INFINITY;
  const byEnd = end(b) - end(a);
  if (byEnd) return byEnd;
  return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
};

export function findResumeGaps(input: {
  /** The saved posting keywords; `null` when the posting has not been read. */
  keywords: readonly string[] | null;
  profile: UserProfile;
  dismissedKeys: readonly string[];
}): ResumeGaps {
  const dismissed = new Set(input.dismissedKeys);
  const profileKnows = profileSkillMatcher(input.profile);

  const requirementGaps = (input.keywords ?? [])
    .filter((keyword) => !profileKnows(keyword) && !dismissed.has(requirementGapKey(keyword)))
    .slice(0, RESUME_GAPS.MAX_REQUIREMENTS);

  const rolesWithoutMetrics = [...input.profile.workExperiences]
    .sort(mostRecentFirst)
    .filter((role) => !/\d/.test(role.description ?? '') && !dismissed.has(roleGapKey(role.id)))
    .slice(0, RESUME_GAPS.MAX_ROLES)
    .map((role) => ({
      workExperienceId: role.id,
      company: role.company,
      title: role.title,
      description: role.description,
    }));

  return { requirementsRead: input.keywords !== null, requirementGaps, rolesWithoutMetrics };
}
