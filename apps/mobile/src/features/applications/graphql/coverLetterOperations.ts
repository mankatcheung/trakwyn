// Hand-written to match apps/web's GenerateCoverLetterCard.tsx GraphQL operation
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).
// The saved-letters list reuses documents/graphql/draftOperations.ts's
// DOCUMENT_DRAFTS_QUERY (same query web reads from), filtered client-side to
// `type === 'cover_letter'`.
//
// `resumeDocumentId` / `resumeDraftId` are at most one of this application's
// resumes to base the letter on (JEF-396); the server resolves and checks it.

export const GENERATE_COVER_LETTER_MUTATION = `
  mutation GenerateCoverLetter($applicationId: ID!, $resumeDocumentId: ID, $resumeDraftId: ID) {
    generateCoverLetter(
      applicationId: $applicationId
      resumeDocumentId: $resumeDocumentId
      resumeDraftId: $resumeDraftId
    ) {
      id
      title
      createdAt
    }
  }
`;
