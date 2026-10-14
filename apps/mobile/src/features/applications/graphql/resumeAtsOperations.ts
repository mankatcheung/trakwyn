// Hand-written to match apps/web's resumeAtsQueries.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

const ATS_SCORE_FIELDS = `
  id
  applicationId
  documentDraftId
  documentId
  score
  label
  readable
  checks { id label passed points maxPoints hint }
  generatedAt
  isStale
`;

export const RESUME_ATS_SCORES_QUERY = `
  query ResumeAtsScores($applicationId: ID!) {
    resumeAtsScores(applicationId: $applicationId) { ${ATS_SCORE_FIELDS} }
  }
`;

export const COMPUTE_RESUME_ATS_SCORE_MUTATION = `
  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {
    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) { ${ATS_SCORE_FIELDS} }
  }
`;
