export const COMPUTE_RESUME_ATS_SCORE = `
  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {
    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {
      score
      label
      readable
      checks { id label passed points maxPoints hint }
    }
  }
`;

export type AtsCheck = {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  /** How to fix the check when it fails. */
  hint: string;
};

export type AtsScore = {
  score: number;
  label: string;
  /** False for a scan or an image: nothing could be read, so only the extraction check is listed. */
  readable: boolean;
  checks: AtsCheck[];
};
