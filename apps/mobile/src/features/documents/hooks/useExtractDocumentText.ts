import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { EXTRACT_DOCUMENT_TEXT_MUTATION } from '../graphql/draftOperations';

export function useExtractDocumentText() {
  return useMutation({
    mutationFn: (documentId: string) =>
      gqlRequest<{ extractDocumentText: { text: string } }>(EXTRACT_DOCUMENT_TEXT_MUTATION, {
        documentId,
      }).then((data) => data.extractDocumentText.text),
  });
}
