import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { ResumeRef } from './-resumeMatchQueries';

const ATS_SCORE_FIELDS = `
  id
  applicationId
  documentDraftId
  documentId
  score
  label
  readable
  checks { id label passed points maxPoints hint }
  generatedAt
  isStale
`;

export const RESUME_ATS_SCORES_QUERY = `
  query ResumeAtsScores($applicationId: ID!) {
    resumeAtsScores(applicationId: $applicationId) { ${ATS_SCORE_FIELDS} }
  }
`;

export const COMPUTE_RESUME_ATS_SCORE = `
  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {
    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) { ${ATS_SCORE_FIELDS} }
  }
`;

export type AtsCheck = {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  /** How to fix the check when it fails. */
  hint: string;
};

export type AtsScore = {
  id: string;
  applicationId: string;
  /** Exactly one of the two is set: the result belongs to a draft or an upload. */
  documentDraftId: string | null;
  documentId: string | null;
  score: number;
  label: string;
  /** False for a scan or an image: nothing could be read, so only the extraction check is listed. */
  readable: boolean;
  checks: AtsCheck[];
  generatedAt: string;
  /** The resume's text changed after this result was scored. */
  isStale: boolean;
};

export const resumeAtsScoresQueryKey = (applicationId: string) =>
  ['resumeAtsScores', applicationId] as const;

export const resumeAtsScoresQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: resumeAtsScoresQueryKey(applicationId),
    queryFn: () =>
      gqlClient.request<{ resumeAtsScores: AtsScore[] }>(RESUME_ATS_SCORES_QUERY, {
        applicationId,
      }),
  });

export const findResumeAtsScore = (
  scores: AtsScore[] | undefined,
  ref: ResumeRef,
): AtsScore | undefined =>
  scores?.find((s) =>
    'documentDraftId' in ref
      ? s.documentDraftId === ref.documentDraftId
      : s.documentId === ref.documentId,
  );
