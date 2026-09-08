import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { RENAME_DOCUMENT_DRAFT_MUTATION } from '../graphql/draftOperations';

export function useRenameDocumentDraft() {
  return useMutation({
    mutationFn: (input: { draftId: string; title: string }) =>
      gqlRequest<{ renameDocumentDraft: { id: string; title: string } }>(
        RENAME_DOCUMENT_DRAFT_MUTATION,
        input,
      ).then((data) => data.renameDocumentDraft),
  });
}
