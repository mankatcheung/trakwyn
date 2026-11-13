import type {
  DocumentDraftVersion,
  DraftVersionSource,
} from '#src/domain/documentDraft/DocumentDraftVersion.js';

export interface CreateDocumentDraftVersionData {
  id: string;
  draftId: string;
  contentJson: string;
  plainText: string;
  source: DraftVersionSource;
}

export interface IDocumentDraftVersionRepository {
  create(data: CreateDocumentDraftVersionData): Promise<DocumentDraftVersion>;
  /** Newest first. */
  listByDraft(draftId: string): Promise<DocumentDraftVersion[]>;
  findById(id: string): Promise<DocumentDraftVersion | null>;
  findLatestByDraft(draftId: string): Promise<DocumentDraftVersion | null>;
  /** Keeps the newest `limit` snapshots of the draft and deletes the rest; returns how many went. */
  pruneToLimit(draftId: string, limit: number): Promise<number>;
}
