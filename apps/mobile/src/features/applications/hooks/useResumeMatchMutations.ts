import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { COMPUTE_RESUME_MATCH_SCORE_MUTATION } from '../graphql/resumeMatchOperations';
import type { ResumeMatchScoreResult } from '../types';

export function useComputeResumeMatchScore(applicationId: string) {
  return useMutation({
    mutationFn: (resumeText: string | null) =>
      gqlRequest<{ computeResumeMatchScore: ResumeMatchScoreResult }>(
        COMPUTE_RESUME_MATCH_SCORE_MUTATION,
        { applicationId, resumeText },
      ).then((data) => data.computeResumeMatchScore),
  });
}
