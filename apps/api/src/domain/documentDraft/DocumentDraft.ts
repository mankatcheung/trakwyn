export interface DocumentDraft {
  id: string;
  applicationId: string;
  type: 'cover_letter' | 'resume';
  title: string;
  contentJson: string;
  plainText: string;
  sourceDocumentId: string | null;
  /** The user's last AI instructions for this draft (JEF-506), kept so the helper can offer them again. */
  aiInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
}
