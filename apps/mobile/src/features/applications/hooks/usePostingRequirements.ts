import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  EXTRACT_POSTING_REQUIREMENTS_MUTATION,
  POSTING_REQUIREMENTS_QUERY,
} from '../graphql/postingRequirementsOperations';
import { useRefreshAiCredits } from '../../ai/hooks/useRefreshAiCredits';
import type { PostingRequirements } from '../types';
import { resumeGapsQueryKey } from './useResumeGaps';

export const postingRequirementsQueryKey = (applicationId: string) =>
  ['postingRequirements', applicationId] as const;

/** The saved requirements, or null when the posting has not been read. Reading never calls AI. */
export function usePostingRequirements(applicationId: string) {
  return useQuery({
    queryKey: postingRequirementsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ postingRequirements: PostingRequirements | null }>(POSTING_REQUIREMENTS_QUERY, {
        applicationId,
      }).then((data) => data.postingRequirements),
    enabled: Boolean(applicationId),
  });
}

/** Reads the posting with AI and keeps the result; the gap questions depend on it, so they refresh too. */
export function useExtractPostingRequirements(applicationId: string) {
  const queryClient = useQueryClient();
  const refreshCredits = useRefreshAiCredits();
  return useMutation({
    onSettled: () => void refreshCredits(),
    mutationFn: () =>
      gqlRequest<{ extractPostingRequirements: PostingRequirements }>(
        EXTRACT_POSTING_REQUIREMENTS_MUTATION,
        { applicationId },
      ).then((data) => data.extractPostingRequirements),
    onSuccess: (saved) => {
      queryClient.setQueryData<PostingRequirements | null>(
        postingRequirementsQueryKey(applicationId),
        saved,
      );
      return queryClient.invalidateQueries({ queryKey: resumeGapsQueryKey(applicationId) });
    },
  });
}
