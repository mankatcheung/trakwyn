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
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
