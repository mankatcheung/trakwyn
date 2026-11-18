import { graphql } from '#/graphql/generated';

export const GENERATE_MUTATION = graphql(`
  mutation GenerateIntoDocumentDraft(
    $draftId: ID!
    $instructions: String
    $resumeDocumentId: ID
    $resumeDraftId: ID
  ) {
    generateIntoDocumentDraft(
      draftId: $draftId
      instructions: $instructions
      resumeDocumentId: $resumeDocumentId
      resumeDraftId: $resumeDraftId
    ) {
      contentJson
      plainText
    }
  }
`);
