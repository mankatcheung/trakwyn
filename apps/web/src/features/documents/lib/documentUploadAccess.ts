export type BlobAccess = 'public' | 'private';

/**
 * The `access` Vercel Blob's `put()` must be given for this upload (JEF-51).
 *
 * A Blob store's access is fixed when it is created, and the client token the
 * API hands out is for one store, so `put()` has to say the same thing the
 * store does or it is refused. The API says which in `requestUploadUrl`'s
 * `access`: documents go to the private store, avatars to the public one.
 *
 * An API that predates the private store sends no `access`, and its token is
 * for the one public store, so anything but an explicit `private` is `public`.
 * That keeps this deploy safe to ship before the API's.
 */
export function blobAccessOf(access: string | null | undefined): BlobAccess {
  return access === 'private' ? 'private' : 'public';
}
