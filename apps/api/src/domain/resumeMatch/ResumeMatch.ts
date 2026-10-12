/**
 * The latest match result for one resume on one application. A resume is
 * either an editable draft or an uploaded file; exactly one of the two ids is
 * set.
 */
export interface ResumeMatch {
  id: string;
  applicationId: string;
  documentDraftId: string | null;
  documentId: string | null;
  score: number;
  label: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
  generatedAt: Date;
  /** Hash of the resume text that was scored; see `hashResumeText`. */
  resumeTextHash: string;
}
