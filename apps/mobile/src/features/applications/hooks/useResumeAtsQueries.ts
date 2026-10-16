import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { RESUME_ATS_SCORES_QUERY } from '../graphql/resumeAtsOperations';
import type { AtsScore, ResumeRef } from '../types';

export const resumeAtsScoresQueryKey = (applicationId: string) =>
  ['resumeAtsScores', applicationId] as const;

/** Prefix of every application's key, for invalidating without knowing which. */
export const RESUME_ATS_SCORES_KEY_PREFIX = ['resumeAtsScores'] as const;

export function useResumeAtsScores(applicationId: string) {
  return useQuery({
    queryKey: resumeAtsScoresQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ resumeAtsScores: AtsScore[] }>(RESUME_ATS_SCORES_QUERY, {
        applicationId,
      }).then((data) => data.resumeAtsScores),
    enabled: Boolean(applicationId),
  });
}

export const findResumeAtsScore = (
  scores: AtsScore[] | undefined,
  ref: ResumeRef,
): AtsScore | undefined =>
  scores?.find((s) =>
    'documentDraftId' in ref
      ? s.documentDraftId === ref.documentDraftId
      : s.documentId === ref.documentId,
  );
