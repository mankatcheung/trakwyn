import { head, get, list, put, del, BlobNotFoundError } from '@vercel/blob';
import type { BlobStoreClient } from '#src/infrastructure/storage/copyDocumentsToPrivateStore.js';
import { toNodeReadable } from '#src/infrastructure/storage/toNodeReadable.js';
import type { StorageAccess } from '#src/use-cases/shared/storageAccess.js';

const LIST_PAGE_SIZE = 1000;

/** A `BlobStoreClient` over one real Vercel Blob store, reached with its own read/write token. */
export function vercelBlobStoreClient(token: string, access: StorageAccess): BlobStoreClient {
  return {
    async list(cursor) {
      const page = await list({ token, cursor, limit: LIST_PAGE_SIZE });
      return {
        blobs: page.blobs.map(({ pathname, size }) => ({ pathname, size })),
        cursor: page.hasMore ? page.cursor : undefined,
      };
    },

    async size(pathname) {
      try {
        return (await head(pathname, { token })).size;
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },

    async read(pathname) {
      const result = await get(pathname, { access, token, useCache: false });
      if (result?.statusCode !== 200) return null;
      return {
        stream: toNodeReadable(result.stream),
        size: result.blob.size,
        contentType: result.blob.contentType,
      };
    },

    async write(pathname, data, contentType) {
      await put(pathname, data, { access, contentType, token, addRandomSuffix: false });
    },

    async remove(pathnames) {
      await del(pathnames, { token });
    },
  };
}
