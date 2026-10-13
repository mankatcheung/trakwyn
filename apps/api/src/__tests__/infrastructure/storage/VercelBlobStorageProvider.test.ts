import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VercelBlobStorageProvider } from '#src/infrastructure/storage/VercelBlobStorageProvider.js';
import { ENV } from '#src/infrastructure/config/constants.js';

const blob = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}
  return { head: vi.fn(), del: vi.fn(), put: vi.fn(), BlobNotFoundError };
});

vi.mock('@vercel/blob', () => blob);
vi.mock('@vercel/blob/client', () => ({ generateClientTokenFromReadWriteToken: vi.fn() }));

const BLOB_URL = 'https://store.public.blob.vercel-storage.com/users/u1/applications/a1/cv.pdf';

async function drain(stream: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString();
}

describe('VercelBlobStorageProvider.getObject', () => {
  const originalToken = process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN];

  beforeEach(() => {
    process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN] = 'blob-token';
    blob.head.mockReset().mockResolvedValue({ url: BLOB_URL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN];
    else process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN] = originalToken;
  });

  it('looks the key up, then streams the blob body with its declared size', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('%PDF body', { headers: { 'content-length': '9' } }));
    vi.stubGlobal('fetch', fetchMock);

    const object = await new VercelBlobStorageProvider().getObject(
      'users/u1/applications/a1/cv.pdf',
    );

    expect(blob.head).toHaveBeenCalledWith('users/u1/applications/a1/cv.pdf', {
      token: 'blob-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(BLOB_URL);
    expect(object?.size).toBe(9);
    expect(await drain(object!.stream)).toBe('%PDF body');
  });

  it('reports no size when the response declares none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('abc')));

    const object = await new VercelBlobStorageProvider().getObject('k');

    expect(object?.size).toBeNull();
  });

  it('returns null when the store has no blob under the key', async () => {
    blob.head.mockRejectedValue(new blob.BlobNotFoundError('not found'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new VercelBlobStorageProvider().getObject('gone')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the blob vanishes between the lookup and the read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(new VercelBlobStorageProvider().getObject('k')).resolves.toBeNull();
  });

  it('throws on any other failure, rather than reporting the file as missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(new VercelBlobStorageProvider().getObject('k')).rejects.toThrow('status 503');

    blob.head.mockRejectedValue(new Error('network down'));
    await expect(new VercelBlobStorageProvider().getObject('k')).rejects.toThrow('network down');
  });

  it('fails clearly when no token is configured', async () => {
    delete process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN];

    await expect(new VercelBlobStorageProvider().getObject('k')).rejects.toThrow(
      `${ENV.BLOB_PUBLIC_READ_WRITE_TOKEN} is not configured`,
    );
  });
});
