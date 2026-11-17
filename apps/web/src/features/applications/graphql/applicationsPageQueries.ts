import { infiniteQueryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

export const PAGE_SIZE = 20;

export const APPLICATIONS_PAGE_QUERY = `
  query ApplicationsPage(
    $status: ApplicationStatus
    $starred: Boolean
    $search: String
    $cursor: String
    $limit: Int
    $likelyGhosted: Boolean
  ) {
    applicationsPage(
      status: $status
      starred: $starred
      search: $search
      cursor: $cursor
      limit: $limit
      likelyGhosted: $likelyGhosted
    ) {
      hasNextPage
      nextCursor
      items {
        id
        company
        role
        status
        location
        description
        appliedAt
        starred
        source
        followUpAt
        tags
        createdAt
      }
    }
  }
`;

export type Application = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  location?: string | null;
  description?: string | null;
  appliedAt?: string | null;
  starred: boolean;
  source?: string | null;
  followUpAt?: string | null;
  tags: string[];
  createdAt: string;
  likelyGhosted: boolean;
};

export type ApplicationsPageResult = {
  applicationsPage: {
    items: Application[];
    hasNextPage: boolean;
    nextCursor: string | null;
  };
};

export function applicationsPageQueryKey(
  status: string | undefined,
  starred: boolean | undefined,
  searchTerm: string,
  likelyGhosted: boolean | undefined,
) {
  return [
    'applications',
    'page',
    status ?? null,
    starred ?? false,
    likelyGhosted ?? false,
    searchTerm,
  ] as const;
}

export function applicationsPageQueryOptions(
  status: string | undefined,
  starred: boolean | undefined,
  searchTerm: string,
  likelyGhosted: boolean | undefined,
) {
  return infiniteQueryOptions({
    queryKey: applicationsPageQueryKey(status, starred, searchTerm, likelyGhosted),
    queryFn: ({ pageParam }) =>
      gqlClient.request<ApplicationsPageResult>(APPLICATIONS_PAGE_QUERY, {
        status: status ?? null,
        starred: starred ?? null,
        search: searchTerm || null,
        cursor: pageParam,
        limit: PAGE_SIZE,
        ...(likelyGhosted !== undefined ? { likelyGhosted } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.applicationsPage.hasNextPage ? lastPage.applicationsPage.nextCursor : undefined,
  });
}
