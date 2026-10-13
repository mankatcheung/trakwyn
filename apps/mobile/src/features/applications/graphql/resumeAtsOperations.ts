// Hand-written to match apps/web's resumeAtsQueries.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

export const COMPUTE_RESUME_ATS_SCORE_MUTATION = `
  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {
    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {
      score
      label
      readable
      checks { id label passed points maxPoints hint }
    }
  }
`;
