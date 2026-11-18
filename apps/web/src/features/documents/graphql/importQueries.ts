import { graphql } from '#/graphql/generated';

export const EXTRACT_TEXT_MUTATION = graphql(`
  mutation ExtractDocumentText($documentId: ID!) {
    extractDocumentText(documentId: $documentId) {
      text
    }
  }
`);
