import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { DISMISS_RESUME_GAP_MUTATION, RESUME_GAPS_QUERY } from '../graphql/resumeGapsOperations';
import {
  CREATE_SKILL_MUTATION,
  UPDATE_WORK_EXPERIENCE_MUTATION,
} from '../../settings/graphql/operations';
import { skillsQueryKey, workExperiencesQueryKey } from '../../settings/hooks/useExperience';
import { appendToDescription } from '../lib/resumeGaps';
import type { ResumeGaps, RoleWithoutMetrics } from '../types';

export const resumeGapsQueryKey = (applicationId: string) => ['resumeGaps', applicationId] as const;

export function useResumeGaps(applicationId: string) {
  return useQuery({
    queryKey: resumeGapsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ resumeGaps: ResumeGaps }>(RESUME_GAPS_QUERY, { applicationId }).then(
        (data) => data.resumeGaps,
      ),
    enabled: Boolean(applicationId),
  });
}

/** "No" to a question: the API remembers it, so web stops asking too. The answer is the new list. */
export function useDismissResumeGap(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      gqlRequest<{ dismissResumeGap: ResumeGaps }>(DISMISS_RESUME_GAP_MUTATION, {
        applicationId,
        key,
      }).then((data) => data.dismissResumeGap),
    onSuccess: (gaps) => queryClient.setQueryData(resumeGapsQueryKey(applicationId), gaps),
  });
}

/** "Yes" to a requirement: it becomes a skill on the profile. */
export function useAddGapSkill(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => gqlRequest(CREATE_SKILL_MUTATION, { input: { name } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: resumeGapsQueryKey(applicationId) }),
        queryClient.invalidateQueries({ queryKey: skillsQueryKey }),
      ]),
  });
}

/** A figure for a role: the line is appended to its description as a bullet. */
export function useAddGapMetric(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, line }: { role: RoleWithoutMetrics; line: string }) =>
      gqlRequest(UPDATE_WORK_EXPERIENCE_MUTATION, {
        id: role.workExperienceId,
        input: { description: appendToDescription(role.description, line) },
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: resumeGapsQueryKey(applicationId) }),
        queryClient.invalidateQueries({ queryKey: workExperiencesQueryKey }),
      ]),
  });
}
