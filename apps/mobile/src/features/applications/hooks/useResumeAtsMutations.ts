import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { COMPUTE_RESUME_ATS_SCORE_MUTATION } from '../graphql/resumeAtsOperations';
import type { AtsScore, ResumeRef } from '../types';
import { resumeAtsScoresQueryKey } from './useResumeAtsQueries';

const sameResume = (a: AtsScore, b: AtsScore): boolean =>
  (a.documentDraftId !== null && a.documentDraftId === b.documentDraftId) ||
  (a.documentId !== null && a.documentId === b.documentId);

/**
 * Checks one resume's ATS readiness and stores the saved result in the cached
 * list, replacing its old one. The score is computed in code, so it needs no
 * AI key and is the same every time for the same text.
 */
export function useComputeResumeAtsScore(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resume: ResumeRef) =>
      gqlRequest<{ computeResumeAtsScore: AtsScore }>(COMPUTE_RESUME_ATS_SCORE_MUTATION, {
        documentDraftId: 'documentDraftId' in resume ? resume.documentDraftId : null,
        documentId: 'documentId' in resume ? resume.documentId : null,
      }).then((data) => data.computeResumeAtsScore),
    onSuccess: (saved) => {
      queryClient.setQueryData<AtsScore[]>(resumeAtsScoresQueryKey(applicationId), (prev) => [
        ...(prev ?? []).filter((s) => s.id !== saved.id && !sameResume(s, saved)),
        saved,
      ]);
    },
  });
}
