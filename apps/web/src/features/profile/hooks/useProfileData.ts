import { useQuery } from '@tanstack/react-query';
import { educationsQueryOptions, type Education } from '../graphql/educationQueries';
import { skillsQueryOptions, type Skill } from '../graphql/skillQueries';
import { workExperiencesQueryOptions, type WorkExperience } from '../graphql/workExperienceQueries';

export interface ProfileDataState {
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  isLoading: boolean;
  isError: boolean;
}

/** All three profile lists, read through the same cache entries the profile page edits. */
export function useProfileData(): ProfileDataState {
  const we = useQuery(workExperiencesQueryOptions);
  const edu = useQuery(educationsQueryOptions);
  const skills = useQuery(skillsQueryOptions);

  return {
    workExperiences: we.data?.workExperiences ?? [],
    educations: edu.data?.educations ?? [],
    skills: skills.data?.skills ?? [],
    isLoading: we.isLoading || edu.isLoading || skills.isLoading,
    isError: we.isError || edu.isError || skills.isError,
  };
}
