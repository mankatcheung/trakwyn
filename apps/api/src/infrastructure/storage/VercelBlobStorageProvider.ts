import { head, get, del, put, BlobNotFoundError } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { IStorageProvider, StoredObject } from '#src/use-cases/ports/IStorageProvider.js';
import { storageAccessFor, type StorageAccess } from '#src/use-cases/shared/storageAccess.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { toNodeReadable } from '#src/infrastructure/storage/toNodeReadable.js';

/**
 * Vercel Blob has no raw presigned-PUT URL like S3/GCS — the client must
 * upload using `put()` from `@vercel/blob/client` with a short-lived client
 * token. `getPresignedUploadUrl` returns that token (as an opaque string, in
 * place of a URL) so the existing IStorageProvider contract and
 * RequestUploadUrlUseCase authorization logic don't need to change; the web
 * app passes it straight through to `put()`. This means uploads go directly
 * from the browser to Blob storage, never through our API — which keeps a file
 * of up to the 10MB document cap out of the API's request path.
 *
 * Two stores (JEF-51), because a Blob store's access is fixed when it is
 * created: a public one for avatars, which other users see as `<img src>`, and
 * a private one for everything else. `storageAccessFor(key)` picks the store,
 * so a new kind of file is private unless it opts out. A private blob has no
 * URL anyone can open: it is read here, with the store's token, and served by
 * the API behind a signed link.
 */
export class VercelBlobStorageProvider implements IStorageProvider {
  private readonly publicToken: string;
  private readonly privateToken: string;

  constructor() {
    this.publicToken = process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN] ?? '';
    this.privateToken = process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN] ?? '';
  }

  /**
   * The store a key lives in, and the token for it. Throws when that store has
   * no token rather than falling back to the other one: a private file must
   * never be written to the public store because a secret was missing.
   */
  private storeFor(key: string): { access: StorageAccess; token: string } {
    const access = storageAccessFor(key);
    const token = access === 'public' ? this.publicToken : this.privateToken;
    if (!token) {
      const name =
        access === 'public' ? ENV.BLOB_PUBLIC_READ_WRITE_TOKEN : ENV.BLOB_PRIVATE_READ_WRITE_TOKEN;
      throw new Error(`${name} is not configured`);
    }
    return { access, token };
  }

  async getPresignedUploadUrl(key: string, mimeType: string, ttlSeconds = 300): Promise<string> {
    return generateClientTokenFromReadWriteToken({
      token: this.storeFor(key).token,
      pathname: key,
      allowedContentTypes: [mimeType],
      addRandomSuffix: false,
      validUntil: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * A URL anyone can open, so only for a file that is meant to be seen
   * widely. Asking for a private key's URL is a bug in the caller, and fails
   * loudly instead of handing out a link to a private file.
   */
  async getSignedUrl(key: string): Promise<string> {
    if (storageAccessFor(key) === 'private') {
      throw new Error('A private file has no storage URL; read it through getObject');
    }
    const blob = await head(key, { token: this.storeFor(key).token });
    return blob.url;
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const { access, token } = this.storeFor(key);
    if (access === 'public') return this.readPublic(key, token);

    const result = await get(key, { access: 'private', token });
    if (result?.statusCode !== 200) return null;
    return { stream: toNodeReadable(result.stream), size: result.blob.size };
  }

  /** A public blob is fetched from its URL; the lookup finds the URL and tells us when there is none. */
  private async readPublic(key: string, token: string): Promise<StoredObject | null> {
    let url: string;
    try {
      ({ url } = await head(key, { token }));
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }

    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok || response.body === null) {
      throw new Error(`Failed to read blob (status ${response.status})`);
    }
    const length = Number(response.headers.get('content-length'));
    return {
      stream: toNodeReadable(response.body),
      size: Number.isFinite(length) && length > 0 ? length : null,
    };
  }

  async delete(key: string): Promise<void> {
    await this.deleteMany([key]);
  }

  /** Best-effort, like every other storage cleanup. Each key is removed from the store it lives in. */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const removals = [
      // `del` takes an array and removes the lot in one request, the whole
      // reason this method exists rather than looping over `delete`.
      { token: this.privateToken, keys: keys.filter((key) => storageAccessFor(key) === 'private') },
      { token: this.publicToken, keys: keys.filter((key) => storageAccessFor(key) === 'public') },
    ];
    await Promise.all(
      removals
        .filter(({ token, keys: group }) => token && group.length > 0)
        .map(async ({ token, keys: group }) => {
          try {
            await del(group, { token });
          } catch {
            // Best-effort cleanup — matches LocalStorageProvider.
          }
        }),
    );
  }

  async putObject(key: string, data: Buffer, mimeType: string): Promise<void> {
    const { access, token } = this.storeFor(key);
    await put(key, data, { access, contentType: mimeType, token });
  }
}
