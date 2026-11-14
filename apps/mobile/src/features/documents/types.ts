export interface Document {
  id: string;
  applicationId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  documentType: string;
  version: string | null;
  createdAt: string;
}

export interface RequestUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
}

export type DocumentDraftType = 'cover_letter' | 'resume';

export interface DocumentDraftSummary {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Only the list query selects it; blank drafts are found by it (JEF-506). */
  plainText?: string;
}

export interface DocumentDraft extends DocumentDraftSummary {
  contentJson: string;
  plainText: string;
  sourceDocumentId: string | null;
  /** The last prompt given to the AI helper on this draft. */
  aiInstructions: string | null;
}

/** Why a draft version was kept (JEF-584). */
export type DraftVersionSource = 'autosave' | 'ai' | 'manual' | 'restore';

export interface DraftVersionSummary {
  id: string;
  source: DraftVersionSource;
  characterCount: number;
  createdAt: string;
}

export interface DraftVersionPreview {
  id: string;
  source: DraftVersionSource;
  contentJson: string;
  plainText: string;
  createdAt: string;
}

export interface RestoredDraft {
  id: string;
  contentJson: string;
  plainText: string;
  updatedAt: string;
}
