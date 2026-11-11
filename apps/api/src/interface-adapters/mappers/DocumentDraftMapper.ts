import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';

export interface DocumentDraftDTO {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  contentJson: string;
  plainText: string;
  sourceDocumentId: string | null;
  aiInstructions: string | null;
  /** The draft has an AI generation behind it, so it can be rated (JEF-547). */
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export class DocumentDraftMapper {
  toDTO(draft: DocumentDraft): DocumentDraftDTO {
    return {
      id: draft.id,
      applicationId: draft.applicationId,
      type: draft.type,
      title: draft.title,
      contentJson: draft.contentJson,
      plainText: draft.plainText,
      sourceDocumentId: draft.sourceDocumentId,
      aiInstructions: draft.aiInstructions,
      aiGenerated: draft.generation !== null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
