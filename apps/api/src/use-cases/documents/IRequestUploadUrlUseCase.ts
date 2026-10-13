import type { StorageAccess } from '#src/use-cases/shared/storageAccess.js';

export interface RequestUploadUrlInput {
  userId: string;
  applicationId: string;
  filename: string;
  mimeType: string;
}

export interface RequestUploadUrlOutput {
  uploadUrl: string;
  storageKey: string;
  /** Which store the upload token is for; the client's `put()` must use the same access (JEF-51). */
  access: StorageAccess;
}

export interface IRequestUploadUrlUseCase {
  execute(input: RequestUploadUrlInput): Promise<RequestUploadUrlOutput>;
}
