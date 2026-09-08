import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { UPDATE_DOCUMENT_DRAFT_CONTENT_MUTATION } from '../graphql/draftOperations';

export interface UpdateDocumentDraftContentInput {
  draftId: string;
  contentJson: string;
  plainText: string;
}

export function useUpdateDocumentDraftContent() {
  return useMutation({
    mutationFn: (input: UpdateDocumentDraftContentInput) =>
      gqlRequest<{ updateDocumentDraftContent: { id: string; updatedAt: string } }>(
        UPDATE_DOCUMENT_DRAFT_CONTENT_MUTATION,
        { input },
      ).then((data) => data.updateDocumentDraftContent),
  });
}
