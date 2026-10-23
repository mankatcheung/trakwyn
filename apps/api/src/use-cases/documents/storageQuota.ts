const BYTES_PER_MB = 1024 * 1024;

function megabytes(bytes: number): string {
  return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
}

/** The message every refusal for a full account carries, so the client shows one wording. */
export function storageFullMessage(usedBytes: number, limitBytes: number): string {
  return `Document storage is full: ${megabytes(usedBytes)} of ${megabytes(limitBytes)} used`;
}
