import type { Education, Skill, WorkExperience } from './profileQueries';

/** Enough skills for a resume to have something to choose from. */
export const MIN_SKILLS_FOR_COMPLETE_PROFILE = 5;

/** The checks in the order a user is asked to complete them. */
export const PROFILE_CHECKS = ['role', 'roleDescription', 'education', 'skills'] as const;

export type ProfileCheck = (typeof PROFILE_CHECKS)[number];

export interface ProfileData {
  workExperiences: readonly Pick<WorkExperience, 'description'>[];
  educations: readonly Pick<Education, 'id'>[];
  skills: readonly Pick<Skill, 'id'>[];
}

export interface ProfileCompleteness {
  /** 0–100, in steps of 100 / PROFILE_CHECKS.length. */
  percent: number;
  passed: Record<ProfileCheck, boolean>;
  /** The first check that has not passed, or null when the profile is complete. */
  nextStep: ProfileCheck | null;
}

export function profileCompleteness({
  workExperiences,
  educations,
  skills,
}: ProfileData): ProfileCompleteness {
  const passed: Record<ProfileCheck, boolean> = {
    role: workExperiences.length > 0,
    roleDescription: workExperiences.some((we) => (we.description ?? '').trim().length > 0),
    education: educations.length > 0,
    skills: skills.length >= MIN_SKILLS_FOR_COMPLETE_PROFILE,
  };
  const passedCount = PROFILE_CHECKS.filter((check) => passed[check]).length;

  return {
    percent: Math.round((passedCount / PROFILE_CHECKS.length) * 100),
    passed,
    nextStep: PROFILE_CHECKS.find((check) => !passed[check]) ?? null,
  };
}
