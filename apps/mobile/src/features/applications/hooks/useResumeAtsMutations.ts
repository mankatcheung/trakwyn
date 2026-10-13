import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { COMPUTE_RESUME_ATS_SCORE_MUTATION } from '../graphql/resumeAtsOperations';
import type { AtsScore, ResumeRef } from '../types';

/**
 * Scores how readable one resume is to an applicant tracking system. Nothing
 * is cached: the score is computed in code, costs no AI key and is the same
 * every time, so the screen holds the latest result and asks again on demand.
 */
export function useComputeResumeAtsScore() {
  return useMutation({
    mutationFn: (resume: ResumeRef) =>
      gqlRequest<{ computeResumeAtsScore: AtsScore }>(COMPUTE_RESUME_ATS_SCORE_MUTATION, {
        documentDraftId: 'documentDraftId' in resume ? resume.documentDraftId : null,
        documentId: 'documentId' in resume ? resume.documentId : null,
      }).then((data) => data.computeResumeAtsScore),
  });
}
