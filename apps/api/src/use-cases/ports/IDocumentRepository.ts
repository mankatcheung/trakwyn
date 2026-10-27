import type { Document } from '#src/domain/document/Document.js';

export interface CreateDocumentData {
  id: string;
  applicationId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  documentType?: string;
  version?: string | null;
  sourceDraftId?: string | null;
  /**
   * The most document bytes the owner may store, from their entitlements.
   * Passed in because the repository charges the owner's total in one
   * conditional `UPDATE`, which is what keeps simultaneous uploads from both
   * passing the limit.
   */
  storageLimitBytes: number;
  /**
   * The most documents one application may hold. Passed in, not read, so the
   * repository only enforces it, in the same conditional `UPDATE` that
   * reserves the slot.
   */
  documentsPerApplicationLimit: number;
}

export interface IDocumentRepository {
  findAllByApplicationId(applicationId: string): Promise<Document[]>;
  countByApplicationId(applicationId: string): Promise<number>;
  /** Every document across every application owned by the user — for cross-application aggregation (e.g. resume-version outcome correlation). */
  findAllByUserId(userId: string): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  create(data: CreateDocumentData): Promise<Document>;
  delete(id: string, applicationId: string): Promise<void>;
}
