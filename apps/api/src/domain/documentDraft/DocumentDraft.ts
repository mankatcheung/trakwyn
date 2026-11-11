import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';

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
  /** The model and prompt behind the draft's last AI generation (JEF-547); null if it never had one. */
  generation: AiGeneration | null;
  createdAt: Date;
  updatedAt: Date;
}
