import { useQuery } from '@tanstack/react-query';
import {
  skillsQueryOptions,
  workExperiencesQueryOptions,
} from '#/routes/_authenticated/profile/-components/profileQueries';

/**
 * Whether the user has neither work experience nor skills, which is what
 * resumes and cover letters are written from (JEF-460). While either list is
 * loading or failed to load this is `false`, so generating is never held up
 * by the check itself.
 */
export function useIsProfileEmpty(): boolean {
  const workExperiences = useQuery(workExperiencesQueryOptions).data?.workExperiences;
  const skills = useQuery(skillsQueryOptions).data?.skills;
  if (!workExperiences || !skills) return false;
  return workExperiences.length === 0 && skills.length === 0;
}
