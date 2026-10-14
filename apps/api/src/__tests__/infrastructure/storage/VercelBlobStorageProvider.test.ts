import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VercelBlobStorageProvider } from '#src/infrastructure/storage/VercelBlobStorageProvider.js';
import { ENV } from '#src/infrastructure/config/constants.js';

const blob = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}
  return {
    head: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    put: vi.fn(),
    generateClientToken: vi.fn(),
    BlobNotFoundError,
  };
});

vi.mock('@vercel/blob', () => blob);
vi.mock('@vercel/blob/client', () => ({
  generateClientTokenFromReadWriteToken: blob.generateClientToken,
}));

const PUBLIC_TOKEN = 'public-store-token';
const PRIVATE_TOKEN = 'private-store-token';
const DOCUMENT_KEY = 'users/u1/applications/a1/cv.pdf';
const EXPORT_KEY = 'documents/a1/doc-1.pdf';
const AVATAR_KEY = 'users/u1/avatar/me.png';
const PUBLIC_URL = `https://public.blob.vercel-storage.com/${AVATAR_KEY}`;

async function drain(stream: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString();
}

/** What `get()` returns for a blob that exists. */
const found = (body: string) => ({
  statusCode: 200,
  stream: new Response(body).body,
  headers: new Headers(),
  blob: { size: body.length },
});

describe('VercelBlobStorageProvider', () => {
  const originals = {
    public: process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN],
    private: process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN],
  };

  beforeEach(() => {
    process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN] = PUBLIC_TOKEN;
    process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN] = PRIVATE_TOKEN;
    for (const fn of [blob.head, blob.get, blob.del, blob.put, blob.generateClientToken]) {
      fn.mockReset();
    }
    blob.head.mockResolvedValue({ url: PUBLIC_URL });
    blob.get.mockResolvedValue(null);
    blob.del.mockResolvedValue(undefined);
    blob.generateClientToken.mockResolvedValue('client-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [name, value] of [
      [ENV.BLOB_PUBLIC_READ_WRITE_TOKEN, originals.public],
      [ENV.BLOB_PRIVATE_READ_WRITE_TOKEN, originals.private],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe('getObject', () => {
    it('reads a private key from the private store with its token, and never touches the public one', async () => {
      blob.get.mockResolvedValue(found('%PDF body'));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const object = await new VercelBlobStorageProvider().getObject(DOCUMENT_KEY);

      expect(blob.get).toHaveBeenCalledWith(DOCUMENT_KEY, {
        access: 'private',
        token: PRIVATE_TOKEN,
      });
      expect(object?.size).toBe(9);
      expect(await drain(object!.stream)).toBe('%PDF body');
      expect(blob.head).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serves an exported PDF from the private store too', async () => {
      blob.get.mockResolvedValue(found('pdf'));

      await new VercelBlobStorageProvider().getObject(EXPORT_KEY);

      expect(blob.get).toHaveBeenCalledWith(EXPORT_KEY, {
        access: 'private',
        token: PRIVATE_TOKEN,
      });
    });

    it('returns null when the private store does not have the blob, without reading the public one', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(new VercelBlobStorageProvider().getObject(DOCUMENT_KEY)).resolves.toBeNull();
      expect(blob.head).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns null for an avatar the public store does not have', async () => {
      blob.head.mockRejectedValue(new blob.BlobNotFoundError('not found'));
      vi.stubGlobal('fetch', vi.fn());

      await expect(new VercelBlobStorageProvider().getObject(AVATAR_KEY)).resolves.toBeNull();
    });

    it('returns null when a public blob vanishes between the lookup and the read', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

      await expect(new VercelBlobStorageProvider().getObject(AVATAR_KEY)).resolves.toBeNull();
    });

    it('reports no size when the public response declares none', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('abc')));

      const object = await new VercelBlobStorageProvider().getObject(AVATAR_KEY);

      expect(object?.size).toBeNull();
    });

    it('reads an avatar from the public store only', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('png')));

      await new VercelBlobStorageProvider().getObject(AVATAR_KEY);

      expect(blob.get).not.toHaveBeenCalled();
      expect(blob.head).toHaveBeenCalledWith(AVATAR_KEY, { token: PUBLIC_TOKEN });
    });

    it('throws on any other failure, rather than reporting the file as missing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
      await expect(new VercelBlobStorageProvider().getObject(AVATAR_KEY)).rejects.toThrow(
        'status 503',
      );

      blob.head.mockRejectedValue(new Error('network down'));
      await expect(new VercelBlobStorageProvider().getObject(AVATAR_KEY)).rejects.toThrow(
        'network down',
      );

      blob.get.mockRejectedValue(new Error('private store down'));
      await expect(new VercelBlobStorageProvider().getObject(DOCUMENT_KEY)).rejects.toThrow(
        'private store down',
      );
    });

    it('fails clearly, with no read, when the private token is missing, instead of using the public store', async () => {
      delete process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];

      await expect(new VercelBlobStorageProvider().getObject(DOCUMENT_KEY)).rejects.toThrow(
        `${ENV.BLOB_PRIVATE_READ_WRITE_TOKEN} is not configured`,
      );
      expect(blob.head).not.toHaveBeenCalled();
    });

    it('still serves avatars when the private token is missing', async () => {
      delete process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('png')));

      await expect(new VercelBlobStorageProvider().getObject(AVATAR_KEY)).resolves.not.toBeNull();
    });
  });

  describe('getPresignedUploadUrl', () => {
    it.each([
      ['a document', DOCUMENT_KEY, PRIVATE_TOKEN],
      ['an exported PDF', EXPORT_KEY, PRIVATE_TOKEN],
      ['an avatar', AVATAR_KEY, PUBLIC_TOKEN],
    ])('mints the client token for %s from the store it belongs in', async (_label, key, token) => {
      const result = await new VercelBlobStorageProvider().getPresignedUploadUrl(
        key,
        'application/pdf',
        120,
      );

      expect(result).toBe('client-token');
      expect(blob.generateClientToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token,
          pathname: key,
          allowedContentTypes: ['application/pdf'],
          addRandomSuffix: false,
        }),
      );
    });

    it('refuses to mint a document token from the public store when the private token is missing', async () => {
      delete process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];

      await expect(
        new VercelBlobStorageProvider().getPresignedUploadUrl(DOCUMENT_KEY, 'application/pdf'),
      ).rejects.toThrow(`${ENV.BLOB_PRIVATE_READ_WRITE_TOKEN} is not configured`);
      expect(blob.generateClientToken).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('gives the public URL of an avatar', async () => {
      blob.head.mockResolvedValue({ url: 'https://public.blob.vercel-storage.com/me.png' });

      await expect(new VercelBlobStorageProvider().getSignedUrl(AVATAR_KEY)).resolves.toBe(
        'https://public.blob.vercel-storage.com/me.png',
      );
      expect(blob.head).toHaveBeenCalledWith(AVATAR_KEY, { token: PUBLIC_TOKEN });
    });

    it.each([DOCUMENT_KEY, EXPORT_KEY])(
      'refuses to give a storage URL for the private file %s',
      async (key) => {
        await expect(new VercelBlobStorageProvider().getSignedUrl(key)).rejects.toThrow(
          'A private file has no storage URL',
        );
        expect(blob.head).not.toHaveBeenCalled();
      },
    );
  });

  describe('putObject', () => {
    it.each([
      ['a document', DOCUMENT_KEY, 'private', PRIVATE_TOKEN],
      ['an exported PDF', EXPORT_KEY, 'private', PRIVATE_TOKEN],
      ['an avatar', AVATAR_KEY, 'public', PUBLIC_TOKEN],
    ])('stores %s in the %s store', async (_label, key, access, token) => {
      const data = Buffer.from('bytes');

      await new VercelBlobStorageProvider().putObject(key, data, 'application/pdf');

      expect(blob.put).toHaveBeenCalledWith(key, data, {
        access,
        contentType: 'application/pdf',
        token,
      });
    });

    it('does not fall back to the public store when the private token is missing', async () => {
      delete process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];

      await expect(
        new VercelBlobStorageProvider().putObject(EXPORT_KEY, Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(`${ENV.BLOB_PRIVATE_READ_WRITE_TOKEN} is not configured`);
      expect(blob.put).not.toHaveBeenCalled();
    });
  });

  describe('deleteMany', () => {
    it('removes each key from the store it lives in', async () => {
      await new VercelBlobStorageProvider().deleteMany([DOCUMENT_KEY, AVATAR_KEY]);

      expect(blob.del).toHaveBeenCalledTimes(2);
      expect(blob.del).toHaveBeenCalledWith([DOCUMENT_KEY], { token: PRIVATE_TOKEN });
      expect(blob.del).toHaveBeenCalledWith([AVATAR_KEY], { token: PUBLIC_TOKEN });
    });

    it('removes a private key from the private store only', async () => {
      await new VercelBlobStorageProvider().deleteMany([DOCUMENT_KEY]);

      expect(blob.del).toHaveBeenCalledTimes(1);
      expect(blob.del).toHaveBeenCalledWith([DOCUMENT_KEY], { token: PRIVATE_TOKEN });
    });

    it('removes an avatar from the public store only', async () => {
      await new VercelBlobStorageProvider().deleteMany([AVATAR_KEY]);

      expect(blob.del).toHaveBeenCalledTimes(1);
      expect(blob.del).toHaveBeenCalledWith([AVATAR_KEY], { token: PUBLIC_TOKEN });
    });

    it('delegates delete to it', async () => {
      await new VercelBlobStorageProvider().delete(DOCUMENT_KEY);

      expect(blob.del).toHaveBeenCalledWith([DOCUMENT_KEY], { token: PRIVATE_TOKEN });
    });

    it('does nothing for no keys', async () => {
      await new VercelBlobStorageProvider().deleteMany([]);

      expect(blob.del).not.toHaveBeenCalled();
    });

    it('is best-effort: one store failing neither throws nor stops the other', async () => {
      blob.del.mockImplementation((_keys: string[], { token }: { token: string }) =>
        token === PRIVATE_TOKEN ? Promise.reject(new Error('boom')) : Promise.resolve(),
      );

      await expect(
        new VercelBlobStorageProvider().deleteMany([DOCUMENT_KEY, AVATAR_KEY]),
      ).resolves.toBeUndefined();
      expect(blob.del).toHaveBeenCalledTimes(2);
      expect(blob.del).toHaveBeenCalledWith([AVATAR_KEY], { token: PUBLIC_TOKEN });
    });

    it('skips a store with no token instead of failing', async () => {
      delete process.env[ENV.BLOB_PUBLIC_READ_WRITE_TOKEN];
      delete process.env[ENV.BLOB_PRIVATE_READ_WRITE_TOKEN];

      await new VercelBlobStorageProvider().deleteMany([DOCUMENT_KEY]);

      expect(blob.del).not.toHaveBeenCalled();
    });
  });
});
