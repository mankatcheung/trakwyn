import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { GENERATE_RESUME_MUTATION } from '../graphql/draftOperations';
import { documentDraftsQueryKey } from './useDocumentDraftQueries';
import type { DocumentDraftSummary } from '../types';

export function useGenerateResume(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ generateResume: DocumentDraftSummary }>(GENERATE_RESUME_MUTATION, {
        applicationId,
      }).then((data) => data.generateResume),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) }),
  });
}
