// Hand-written to match apps/web's ResumeMatchTab.tsx GraphQL operations
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).
// The uploaded-resume lookup reuses documents/graphql/operations.ts's
// DOCUMENTS_QUERY (same query web reads from), filtered client-side to
// `documentType === 'resume'`.

export const COMPUTE_RESUME_MATCH_SCORE_MUTATION = `
  mutation ComputeResumeMatchScore($applicationId: ID!, $resumeText: String) {
    computeResumeMatchScore(applicationId: $applicationId, resumeText: $resumeText) {
      score
      label
      matchedKeywords
      missingKeywords
      summary
    }
  }
`;
