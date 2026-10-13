import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { RESUME_MATCHES_QUERY } from '../graphql/resumeMatchOperations';
import type { ResumeMatch, ResumeRef } from '../types';

export const resumeMatchesQueryKey = (applicationId: string) =>
  ['resumeMatches', applicationId] as const;

/** Prefix of every application's key, for invalidating without knowing which. */
export const RESUME_MATCHES_KEY_PREFIX = ['resumeMatches'] as const;

export function useResumeMatches(applicationId: string) {
  return useQuery({
    queryKey: resumeMatchesQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ resumeMatches: ResumeMatch[] }>(RESUME_MATCHES_QUERY, { applicationId }).then(
        (data) => data.resumeMatches,
      ),
    enabled: Boolean(applicationId),
  });
}

export const findResumeMatch = (
  matches: ResumeMatch[] | undefined,
  ref: ResumeRef,
): ResumeMatch | undefined =>
  matches?.find((m) =>
    'documentDraftId' in ref
      ? m.documentDraftId === ref.documentDraftId
      : m.documentId === ref.documentId,
  );
