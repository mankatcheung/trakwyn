/** Whether a stored file may be read by anyone holding its URL, or only through the API. */
export type StorageAccess = 'public' | 'private';

/**
 * Avatars are keyed `users/<id>/avatar/…` by `RequestAvatarUploadUrlUseCase`.
 * They are meant to be seen by other users as `<img src>`, so they are the one
 * kind of file that stays public.
 */
const PUBLIC_KEY = /^users\/[^/]+\/avatar\//;

/**
 * The access a stored file has (JEF-51). Everything that is not an avatar is
 * private: a document, an exported PDF, and any key a future feature invents.
 * Defaulting to private means a new call site cannot leak by forgetting to
 * choose. Decided from the key alone so the storage providers, the upload-URL
 * use cases and the dev `/uploads/*` route cannot disagree.
 */
export function storageAccessFor(storageKey: string): StorageAccess {
  return PUBLIC_KEY.test(storageKey) ? 'public' : 'private';
}
