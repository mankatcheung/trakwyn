import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const RESUME_MATCH_FIELDS = `
  id
  applicationId
  documentDraftId
  documentId
  score
  label
  matchedKeywords
  missingKeywords
  summary
  generatedAt
  isStale
`;

export const RESUME_MATCHES_QUERY = `
  query ResumeMatches($applicationId: ID!) {
    resumeMatches(applicationId: $applicationId) { ${RESUME_MATCH_FIELDS} }
  }
`;

export const COMPUTE_RESUME_MATCH_SCORE = `
  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {
    computeResumeMatchScore(
      applicationId: $applicationId
      documentDraftId: $documentDraftId
      documentId: $documentId
    ) { ${RESUME_MATCH_FIELDS} }
  }
`;

export type ResumeMatch = {
  id: string;
  applicationId: string;
  /** Exactly one of the two is set: the match belongs to a draft or an upload. */
  documentDraftId: string | null;
  documentId: string | null;
  score: number;
  label: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
  generatedAt: string;
  /** The resume's text changed after this match was generated. */
  isStale: boolean;
};

export const resumeMatchesQueryKey = (applicationId: string) =>
  ['resumeMatches', applicationId] as const;

export const resumeMatchesQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: resumeMatchesQueryKey(applicationId),
    queryFn: () =>
      gqlClient.request<{ resumeMatches: ResumeMatch[] }>(RESUME_MATCHES_QUERY, {
        applicationId,
      }),
  });

/** Which resume a match belongs to: a draft or an uploaded file. */
export type ResumeRef = { documentDraftId: string } | { documentId: string };

export const findResumeMatch = (
  matches: ResumeMatch[] | undefined,
  ref: ResumeRef,
): ResumeMatch | undefined =>
  matches?.find((m) =>
    'documentDraftId' in ref
      ? m.documentDraftId === ref.documentDraftId
      : m.documentId === ref.documentId,
  );
