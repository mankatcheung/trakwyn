import type { Readable } from 'node:stream';

/** A stored file opened for reading; `size` is null when the backend did not say. */
export interface StoredObject {
  stream: Readable;
  size: number | null;
}

export interface IStorageProvider {
  getPresignedUploadUrl(key: string, mimeType: string, ttlSeconds?: number): Promise<string>;
  /**
   * A URL anyone holding it can open. Only for files meant to be seen widely
   * (avatars); a document is read through `getObject` and served behind
   * `IDocumentFileLinks` (JEF-51).
   */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Opens a stored file for reading, or null when no object has that key. */
  getObject(key: string): Promise<StoredObject | null>;
  putObject(key: string, data: Buffer, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Remove several objects in as few round trips as the backend allows.
   * Emptying Trash runs this once per application from inside a serverless
   * request, where a call per blob adds up quickly. Best-effort like
   * `delete`: a key that is already gone is not an error.
   */
  deleteMany(keys: string[]): Promise<void>;
}
