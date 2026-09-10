import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { DELETE_DOCUMENT_DRAFT_MUTATION } from '../graphql/draftOperations';
import { documentDraftsQueryKey } from './useDocumentDraftQueries';

export function useDeleteDocumentDraft(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      gqlRequest<{ deleteDocumentDraft: boolean }>(DELETE_DOCUMENT_DRAFT_MUTATION, { id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) }),
  });
}
