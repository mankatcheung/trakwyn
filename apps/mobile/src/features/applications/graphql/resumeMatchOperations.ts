// Hand-written to match apps/web's resumeMatchQueries.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

const RESUME_MATCH_FIELDS = `
  id
  applicationId
  documentDraftId
  documentId
  score
  label
  matchedKeywords
  missingKeywords
  summary
  generatedAt
  isStale
`;

export const RESUME_MATCHES_QUERY = `
  query ResumeMatches($applicationId: ID!) {
    resumeMatches(applicationId: $applicationId) { ${RESUME_MATCH_FIELDS} }
  }
`;

export const COMPUTE_RESUME_MATCH_SCORE_MUTATION = `
  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {
    computeResumeMatchScore(
      applicationId: $applicationId
      documentDraftId: $documentDraftId
      documentId: $documentId
    ) { ${RESUME_MATCH_FIELDS} }
  }
`;
