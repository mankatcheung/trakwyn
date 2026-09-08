import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { EXPORT_DOCUMENT_DRAFT_TO_PDF_MUTATION } from '../graphql/draftOperations';
import { documentsQueryKey } from './useDocumentQueries';
import type { Document } from '../types';

export function useExportDocumentDraftToPdf(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) =>
      gqlRequest<{ exportDocumentDraftToPdf: Document }>(EXPORT_DOCUMENT_DRAFT_TO_PDF_MUTATION, {
        draftId,
      }).then((data) => data.exportDocumentDraftToPdf),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsQueryKey(applicationId) }),
  });
}
