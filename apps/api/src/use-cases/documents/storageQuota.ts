import { CONTENT_LIMITS } from '#src/use-cases/constants.js';

const BYTES_PER_MB = 1024 * 1024;

/**
 * The most document bytes this user may store. One constant for everyone until
 * plans exist (JEF-344), which replaces it here with the plan entitlement.
 * `DrizzleDocumentRepository.create` enforces `CONTENT_LIMITS` directly, so it
 * needs the entitlement passed in at that point.
 */
export function storageLimitFor(_user: { id: string }): number {
  return CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES;
}

function megabytes(bytes: number): string {
  return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
}

/** The message every refusal for a full account carries, so the client shows one wording. */
export function storageFullMessage(usedBytes: number, limitBytes: number): string {
  return `Document storage is full: ${megabytes(usedBytes)} of ${megabytes(limitBytes)} used`;
}
