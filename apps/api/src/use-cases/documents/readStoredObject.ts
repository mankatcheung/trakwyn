import type { StoredObject } from '#src/use-cases/ports/IStorageProvider.js';

/** The file was bigger than the caller allowed; nothing past the limit was kept. */
export class StoredObjectTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Stored object exceeds ${maxBytes} bytes`);
    this.name = 'StoredObjectTooLargeError';
  }
}

/**
 * Reads a stored file into memory. The declared size is checked before any
 * byte is read, and the running total while reading, since a backend may omit
 * the size or get it wrong. On overflow the stream is destroyed so the rest of
 * the file is never downloaded.
 */
export async function readStoredObject(
  object: StoredObject,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Buffer> {
  if (object.size !== null && object.size > maxBytes) {
    object.stream.destroy();
    throw new StoredObjectTooLargeError(maxBytes);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of object.stream) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += piece.byteLength;
    if (total > maxBytes) {
      object.stream.destroy();
      throw new StoredObjectTooLargeError(maxBytes);
    }
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}
