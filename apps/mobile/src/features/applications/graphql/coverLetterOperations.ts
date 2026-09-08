// Hand-written to match apps/web's CoverLetterTab.tsx GraphQL operations
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).
// The saved-letters list reuses documents/graphql/draftOperations.ts's
// DOCUMENT_DRAFTS_QUERY (same query web reads from), filtered client-side to
// `type === 'cover_letter'`.

export const GENERATE_COVER_LETTER_MUTATION = `
  mutation GenerateCoverLetter($applicationId: ID!, $resumeText: String) {
    generateCoverLetter(applicationId: $applicationId, resumeText: $resumeText) {
      id
      title
      createdAt
    }
  }
`;
