import type { StorageAccess } from '#src/use-cases/shared/storageAccess.js';

export interface RequestAvatarUploadUrlInput {
  userId: string;
  filename: string;
  mimeType: string;
}

export interface RequestAvatarUploadUrlOutput {
  uploadUrl: string;
  storageKey: string;
  /** Which store the upload token is for; the client's `put()` must use the same access (JEF-51). */
  access: StorageAccess;
}

export interface IRequestAvatarUploadUrlUseCase {
  execute(input: RequestAvatarUploadUrlInput): Promise<RequestAvatarUploadUrlOutput>;
}
