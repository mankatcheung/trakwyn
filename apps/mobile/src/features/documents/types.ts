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
}

export interface DocumentDraft extends DocumentDraftSummary {
  contentJson: string;
  plainText: string;
  sourceDocumentId: string | null;
}
