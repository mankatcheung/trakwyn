import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { COMPUTE_RESUME_MATCH_SCORE_MUTATION } from '../graphql/resumeMatchOperations';
import type { ResumeMatch, ResumeRef } from '../types';
import { resumeMatchesQueryKey } from './useResumeMatchQueries';

const sameResume = (a: ResumeMatch, b: ResumeMatch): boolean =>
  (a.documentDraftId !== null && a.documentDraftId === b.documentDraftId) ||
  (a.documentId !== null && a.documentId === b.documentId);

/** Scores one resume and stores the result in the cached list, replacing its old match. */
export function useComputeResumeMatchScore(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resume: ResumeRef) =>
      gqlRequest<{ computeResumeMatchScore: ResumeMatch }>(COMPUTE_RESUME_MATCH_SCORE_MUTATION, {
        applicationId,
        documentDraftId: 'documentDraftId' in resume ? resume.documentDraftId : null,
        documentId: 'documentId' in resume ? resume.documentId : null,
      }).then((data) => data.computeResumeMatchScore),
    onSuccess: (saved) => {
      queryClient.setQueryData<ResumeMatch[]>(resumeMatchesQueryKey(applicationId), (prev) => [
        ...(prev ?? []).filter((m) => !sameResume(m, saved)),
        saved,
      ]);
    },
  });
}
