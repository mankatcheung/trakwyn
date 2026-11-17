import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';

export const POSTING_REQUIREMENTS_QUERY = graphql(`
  query PostingRequirements($applicationId: ID!) {
    postingRequirements(applicationId: $applicationId) {
      id
      applicationId
      mustHave
      niceToHave
      keywords
      seniority
      generatedAt
      isStale
    }
  }
`);

export const EXTRACT_POSTING_REQUIREMENTS = graphql(`
  mutation ExtractPostingRequirements($applicationId: ID!) {
    extractPostingRequirements(applicationId: $applicationId) {
      id
      applicationId
      mustHave
      niceToHave
      keywords
      seniority
      generatedAt
      isStale
    }
  }
`);

/** What an application's posting asks for, as the API read it (JEF-593). */
export type PostingRequirements = {
  id: string;
  applicationId: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  seniority: string | null;
  generatedAt: string;
  /** The posting was edited after these were read. */
  isStale: boolean;
};

export type PostingRequirementsData = { postingRequirements: PostingRequirements | null };

export const postingRequirementsQueryKey = (applicationId: string) =>
  ['postingRequirements', applicationId] as const;

export const postingRequirementsQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: postingRequirementsQueryKey(applicationId),
    queryFn: () =>
      gqlClient.request<PostingRequirementsData>(POSTING_REQUIREMENTS_QUERY, { applicationId }),
  });
