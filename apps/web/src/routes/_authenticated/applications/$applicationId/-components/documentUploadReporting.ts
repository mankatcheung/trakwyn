import { captureException } from '#/lib/analytics';

/**
 * Failure reporting for the document upload flow (JEF-358).
 *
 * The flow is `requestUploadUrl` → upload the file → `confirmDocument`. The
 * two GraphQL steps already go through `gqlClient`, whose response
 * middleware reports a 5xx or an unreachable API tagged with the operation
 * name (`RequestUploadUrl`, `ConfirmDocument`) and deliberately ignores the
 * 4xx and domain errors that are the API working correctly. Reporting those
 * steps again here would send every such failure twice.
 *
 * The middle step is the gap: Vercel Blob's `put()`, or the `PUT` to the
 * local `/uploads/_upload/*` route, goes around `gqlClient` entirely, so an
 * expired Blob token or a CORS failure used to show the user an error and
 * tell us nothing. That is the one this module reports.
 *
 * The filename is never sent — it routinely contains a person's name or a
 * company. What goes instead is enough to group the failures: the provider,
 * the MIME type and a size bucket.
 */

export type UploadProvider = 'blob' | 'local';

const BYTES_PER_MB = 1024 * 1024;
const SMALL_UPLOAD_MAX_MB = 1;
const LARGE_UPLOAD_MIN_MB = 10;

/** Which storage the API handed out: the local provider's URL runs through its own `/_upload/` route. */
export function uploadProviderOf(uploadUrl: string): UploadProvider {
  return uploadUrl.includes('/_upload/') ? 'local' : 'blob';
}

/** The file's size, bucketed — the exact byte count is a fingerprint and adds nothing to a failure. */
export function sizeBucket(bytes: number): '<1MB' | '1-10MB' | '>10MB' {
  if (bytes < SMALL_UPLOAD_MAX_MB * BYTES_PER_MB) return '<1MB';
  if (bytes <= LARGE_UPLOAD_MIN_MB * BYTES_PER_MB) return '1-10MB';
  return '>10MB';
}

/** Reports a failure uploading the file to storage. Never throws, like `captureException` itself. */
export function reportStorageFailure(
  error: unknown,
  { provider, file }: { provider: UploadProvider; file: Pick<File, 'type' | 'size'> },
): void {
  captureException(error, {
    kind: 'document_upload_failed',
    stage: 'storage',
    provider,
    mime_type: file.type || 'unknown',
    size_bucket: sizeBucket(file.size),
  });
}
