import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { graphql } from '#/graphql/generated';

const APPLICATIONS_QUERY = graphql(`
  query BoardApplications {
    applications {
      id
      company
      role
      status
      location
      appliedAt
      starred
      createdAt
      tags
      likelyGhosted
      boardPosition
    }
  }
`);

export type BoardApplication = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  location?: string | null;
  appliedAt?: string | null;
  starred: boolean;
  createdAt: string;
  tags: string[];
  likelyGhosted: boolean;
  /** Rank within its status column, ascending. */
  boardPosition: number;
};

// Kept in its own module (no dnd-kit/component imports) so the board route's
// loader can prefetch this without pulling the lazy-loaded board component's
// heavier dependencies into the eagerly-loaded route chunk.
export const boardApplicationsQueryOptions = queryOptions({
  queryKey: ['applications', null],
  queryFn: async () =>
    (await gqlClient.request(APPLICATIONS_QUERY)) as { applications: BoardApplication[] },
  // A board route restored from browser history can otherwise reuse a stale
  // snapshot from before the list view was visited.
  refetchOnMount: 'always',
});

export const MOVE_ON_BOARD = graphql(`
  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {
    moveApplicationOnBoard(input: $input) {
      id
      status
      boardPosition
    }
  }
`);
