import { QueryClient, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode, PLAN_REQUIRED_CODE } from '#/lib/graphqlError';

const MAX_QUERY_RETRIES = 1;

/**
 * A failed query is tried once more, except for a feature the user's plan does
 * not include (JEF-344): asking again cannot change that answer, and the retry
 * delay would only hold the upgrade prompt back.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (getGqlErrorCode(error) === PLAN_REQUIRED_CODE) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

export const queryClient = new QueryClient({
  // Fires for every mutation that doesn't already handle its own error (in
  // addition to, not instead of, any mutation-level onError) — a safety net
  // so a mutation with no bespoke error handling (board drag-and-drop, bulk
  // actions, note/contact/interview-round CRUD, logout) still surfaces
  // something to the user instead of failing silently.
  mutationCache: new MutationCache({
    onError: (error) => toast.error(getErrorMessage(error)),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: shouldRetryQuery,
    },
  },
});
