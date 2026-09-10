import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { CREATE_DOCUMENT_DRAFT_MUTATION } from '../graphql/draftOperations';
import { documentDraftsQueryKey } from './useDocumentDraftQueries';
import type { DocumentDraft } from '../types';

export interface CreateDocumentDraftInput {
  applicationId: string;
  type: string;
  title: string;
  contentJson: string;
  plainText: string;
  sourceDocumentId?: string | null;
}

export function useCreateDocumentDraft(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocumentDraftInput) =>
      gqlRequest<{ createDocumentDraft: DocumentDraft }>(CREATE_DOCUMENT_DRAFT_MUTATION, {
        input,
      }).then((data) => data.createDocumentDraft),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) }),
  });
}
