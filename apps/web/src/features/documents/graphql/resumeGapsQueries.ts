import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export const RESUME_GAPS_QUERY = graphql(`
  query ResumeGaps($applicationId: ID!) {
    resumeGaps(applicationId: $applicationId) {
      requirementsRead
      requirementGaps
      rolesWithoutMetrics {
        workExperienceId
        company
        title
        description
      }
    }
  }
`);

export const DISMISS_RESUME_GAP = graphql(`
  mutation DismissResumeGap($applicationId: ID!, $key: String!) {
    dismissResumeGap(applicationId: $applicationId, key: $key) {
      requirementsRead
      requirementGaps
      rolesWithoutMetrics {
        workExperienceId
        company
        title
        description
      }
    }
  }
`);

export type RoleWithoutMetrics = {
  workExperienceId: string;
  company: string;
  title: string;
  /** The description as stored, which an answer is appended to. */
  description: string | null;
};

/** What would strengthen a resume for an application, as the API worked it out (JEF-594). */
export type ResumeGaps = {
  /** False when the posting's requirements have not been read yet. */
  requirementsRead: boolean;
  requirementGaps: string[];
  rolesWithoutMetrics: RoleWithoutMetrics[];
};

export type ResumeGapsData = { resumeGaps: ResumeGaps };

/** The key the API stores a role's "no" under; a requirement is sent as shown. */
export const roleGapKey = (workExperienceId: string) => `role:${workExperienceId}`;

export const resumeGapsQueryKey = (applicationId: string) => ['resumeGaps', applicationId] as const;

export const resumeGapsQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: resumeGapsQueryKey(applicationId),
    queryFn: () => gqlClient.request<ResumeGapsData>(RESUME_GAPS_QUERY, { applicationId }),
  });

/** The API's limit on a work experience description; an answer that would pass it is refused here. */
export const ROLE_DESCRIPTION_MAX_CHARS = 2000;

/** The role's description with the new line added as its own bullet. */
export function appendToDescription(description: string | null, line: string): string {
  const bullet = `- ${line.trim().replace(/^[-•*]\s*/, '')}`;
  const existing = description?.trimEnd() ?? '';
  return existing ? `${existing}\n${bullet}` : bullet;
}
