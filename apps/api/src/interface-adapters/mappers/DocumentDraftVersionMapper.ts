import type {
  DocumentDraftVersion,
  DraftVersionSource,
} from '#src/domain/documentDraft/DocumentDraftVersion.js';

export interface DocumentDraftVersionDTO {
  id: string;
  draftId: string;
  source: DraftVersionSource;
  /** Length of the text, so the history list can show size without sending the content. */
  characterCount: number;
  contentJson: string;
  plainText: string;
  createdAt: string;
}

export class DocumentDraftVersionMapper {
  toDTO(version: DocumentDraftVersion): DocumentDraftVersionDTO {
    return {
      id: version.id,
      draftId: version.draftId,
      source: version.source,
      characterCount: version.plainText.length,
      contentJson: version.contentJson,
      plainText: version.plainText,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
