import { storageAccessFor } from '#src/use-cases/shared/storageAccess.js';
import type { StoredObject } from '#src/use-cases/ports/IStorageProvider.js';
import { readStoredObject } from '#src/use-cases/documents/readStoredObject.js';

/** The slice of a Blob store this migration needs, so it can be tested without one. */
export interface BlobStoreClient {
  /** One page of the store's blobs, by pathname and size. */
  list(cursor?: string): Promise<{
    blobs: Array<{ pathname: string; size: number }>;
    cursor?: string;
  }>;
  /** The size of a stored blob, or null when there is none. */
  size(pathname: string): Promise<number | null>;
  /** A blob's bytes and content type, or null when there is none. */
  read(pathname: string): Promise<(StoredObject & { contentType: string }) | null>;
  write(pathname: string, data: Buffer, contentType: string): Promise<void>;
  remove(pathnames: string[]): Promise<void>;
}

export interface CopyOptions {
  source: BlobStoreClient;
  target: BlobStoreClient;
  /** Remove each blob from the source once it is verified in the target. */
  deleteFromSource: boolean;
  /** Report what would happen without writing or deleting anything. */
  dryRun: boolean;
  log?: (message: string) => void;
}

export interface CopyReport {
  /** Blobs the source holds that are not public by policy (documents, exported PDFs). */
  considered: number;
  /** Public by policy (avatars): left where they are. */
  skippedPublic: number;
  /** Already in the target with the same size. */
  alreadyCopied: number;
  copied: number;
  deletedFromSource: number;
  failures: Array<{ pathname: string; reason: string }>;
}

const DELETE_BATCH_SIZE = 100;

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Moves every non-public blob from the public Blob store to the private one
 * (JEF-51), keeping its pathname so no `storageKey` in the database changes.
 *
 * Safe to run any number of times, while the app is serving traffic:
 * - **Idempotent.** A blob already in the target with the same size is left
 *   alone, so a run that was interrupted resumes where it stopped.
 * - **Verified.** A copy counts only when the target then reports the size that
 *   was read. Nothing is deleted from the source on an unverified copy, and a
 *   failure on one blob does not stop the rest.
 * - **Read-only on the source** unless `deleteFromSource`, which is the final
 *   step of the rollout: until then the public copy keeps serving as the
 *   provider's fallback.
 * - Blobs the policy keeps public (avatars) are never touched.
 *
 * It enumerates the store rather than the database, so it also moves blobs no
 * row points at (a deleted document's leftovers): they were public too.
 */
export async function copyDocumentsToPrivateStore(options: CopyOptions): Promise<CopyReport> {
  const { source, target, deleteFromSource, dryRun } = options;
  const log = options.log ?? (() => {});
  const report: CopyReport = {
    considered: 0,
    skippedPublic: 0,
    alreadyCopied: 0,
    copied: 0,
    deletedFromSource: 0,
    failures: [],
  };
  const verified: string[] = [];

  const flushDeletes = async (force: boolean) => {
    if (!deleteFromSource || dryRun) return;
    while (verified.length >= DELETE_BATCH_SIZE || (force && verified.length > 0)) {
      const batch = verified.splice(0, DELETE_BATCH_SIZE);
      try {
        await source.remove(batch);
        report.deletedFromSource += batch.length;
      } catch (error) {
        for (const pathname of batch) {
          report.failures.push({ pathname, reason: `delete failed: ${reasonOf(error)}` });
        }
      }
    }
  };

  let cursor: string | undefined;
  do {
    const page = await source.list(cursor);
    cursor = page.cursor;

    for (const { pathname, size } of page.blobs) {
      if (storageAccessFor(pathname) === 'public') {
        report.skippedPublic++;
        continue;
      }
      report.considered++;

      try {
        if ((await target.size(pathname)) === size) {
          report.alreadyCopied++;
          verified.push(pathname);
          continue;
        }
        if (dryRun) {
          log(`would copy ${pathname} (${size} bytes)`);
          report.copied++;
          continue;
        }

        const object = await source.read(pathname);
        if (!object) throw new Error('vanished from the source before it was read');
        const data = await readStoredObject(object);
        await target.write(pathname, data, object.contentType);
        const written = await target.size(pathname);
        if (written !== data.byteLength) {
          throw new Error(`target holds ${written ?? 'nothing'}, read ${data.byteLength} bytes`);
        }

        log(`copied ${pathname} (${data.byteLength} bytes)`);
        report.copied++;
        verified.push(pathname);
      } catch (error) {
        log(`FAILED ${pathname}: ${reasonOf(error)}`);
        report.failures.push({ pathname, reason: reasonOf(error) });
      }
    }
    await flushDeletes(false);
  } while (cursor);

  await flushDeletes(true);
  return report;
}
