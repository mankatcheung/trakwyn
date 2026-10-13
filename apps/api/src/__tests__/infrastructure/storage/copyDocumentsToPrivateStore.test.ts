import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  copyDocumentsToPrivateStore,
  type BlobStoreClient,
} from '#src/infrastructure/storage/copyDocumentsToPrivateStore.js';

const DOC = 'users/u1/applications/a1/cv.pdf';
const DOC_2 = 'users/u1/applications/a1/letter.pdf';
const EXPORT = 'documents/a1/doc-1.pdf';
const AVATAR = 'users/u1/avatar/me.png';

interface FakeStore extends BlobStoreClient {
  blobs: Map<string, { data: Buffer; contentType: string }>;
  calls: { write: string[]; remove: string[][]; list: Array<string | undefined> };
}

/** An in-memory Blob store, listing `pageSize` blobs at a time. */
function makeStore(
  initial: Record<string, string> = {},
  pageSize = 1000,
  overrides: Partial<BlobStoreClient> = {},
): FakeStore {
  const blobs: FakeStore['blobs'] = new Map(
    Object.entries(initial).map(([key, body]) => [
      key,
      { data: Buffer.from(body), contentType: 'application/pdf' },
    ]),
  );
  const calls: FakeStore['calls'] = { write: [], remove: [], list: [] };

  const store: FakeStore = {
    blobs,
    calls,
    async list(cursor) {
      calls.list.push(cursor);
      const keys = [...blobs.keys()].sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        blobs: page.map((pathname) => ({ pathname, size: blobs.get(pathname)!.data.length })),
        cursor: next < keys.length ? String(next) : undefined,
      };
    },
    async size(pathname) {
      return blobs.get(pathname)?.data.length ?? null;
    },
    async read(pathname) {
      const blob = blobs.get(pathname);
      if (!blob) return null;
      return {
        stream: Readable.from([blob.data]),
        size: blob.data.length,
        contentType: blob.contentType,
      };
    },
    async write(pathname, data, contentType) {
      calls.write.push(pathname);
      blobs.set(pathname, { data, contentType });
    },
    async remove(pathnames) {
      calls.remove.push(pathnames);
      for (const pathname of pathnames) blobs.delete(pathname);
    },
    ...overrides,
  };
  return store;
}

const run = (
  source: FakeStore,
  target: FakeStore,
  options: { deleteFromSource?: boolean; dryRun?: boolean } = {},
) =>
  copyDocumentsToPrivateStore({
    source,
    target,
    deleteFromSource: options.deleteFromSource ?? false,
    dryRun: options.dryRun ?? false,
  });

describe('copyDocumentsToPrivateStore', () => {
  it('copies documents and exported PDFs under the same pathname and content type', async () => {
    const source = makeStore({ [DOC]: 'cv bytes', [EXPORT]: 'export bytes' });
    source.blobs.get(DOC)!.contentType = 'application/msword';
    const target = makeStore();

    const report = await run(source, target);

    expect(report).toMatchObject({ considered: 2, copied: 2, alreadyCopied: 0, failures: [] });
    expect(target.blobs.get(DOC)).toEqual({
      data: Buffer.from('cv bytes'),
      contentType: 'application/msword',
    });
    expect(target.blobs.get(EXPORT)?.data.toString()).toBe('export bytes');
  });

  it('leaves the source untouched unless asked to delete', async () => {
    const source = makeStore({ [DOC]: 'cv bytes' });

    await run(source, makeStore());

    expect(source.calls.remove).toEqual([]);
    expect(source.blobs.has(DOC)).toBe(true);
  });

  it('never touches an avatar, which stays public', async () => {
    const source = makeStore({ [AVATAR]: 'png', [DOC]: 'cv' });
    const target = makeStore();

    const report = await run(source, target, { deleteFromSource: true });

    expect(report).toMatchObject({ considered: 1, skippedPublic: 1, copied: 1 });
    expect(target.blobs.has(AVATAR)).toBe(false);
    expect(source.blobs.has(AVATAR)).toBe(true);
  });

  it('is idempotent: a second run copies nothing', async () => {
    const source = makeStore({ [DOC]: 'cv bytes', [DOC_2]: 'letter' });
    const target = makeStore();
    await run(source, target);
    target.calls.write.length = 0;

    const report = await run(source, target);

    expect(report).toMatchObject({ copied: 0, alreadyCopied: 2, failures: [] });
    expect(target.calls.write).toEqual([]);
  });

  it('resumes after an interruption, copying only what is missing', async () => {
    const source = makeStore({ [DOC]: 'cv bytes', [DOC_2]: 'letter' });
    const target = makeStore({ [DOC]: 'cv bytes' });

    const report = await run(source, target);

    expect(report).toMatchObject({ copied: 1, alreadyCopied: 1 });
    expect(target.calls.write).toEqual([DOC_2]);
  });

  it('replaces a partial copy whose size differs from the source', async () => {
    const source = makeStore({ [DOC]: 'the whole file' });
    const target = makeStore({ [DOC]: 'the who' });

    const report = await run(source, target);

    expect(report.copied).toBe(1);
    expect(target.blobs.get(DOC)?.data.toString()).toBe('the whole file');
  });

  it('walks every page of the source listing', async () => {
    const source = makeStore(
      { [DOC]: 'a', [DOC_2]: 'b', [EXPORT]: 'c', 'documents/a1/doc-2.pdf': 'd' },
      2,
    );
    const target = makeStore();

    const report = await run(source, target);

    expect(report.copied).toBe(4);
    expect(source.calls.list).toEqual([undefined, '2']);
  });

  describe('dry run', () => {
    it('reports what would be copied and writes and deletes nothing', async () => {
      const source = makeStore({ [DOC]: 'cv bytes', [DOC_2]: 'letter' });
      const target = makeStore({ [DOC_2]: 'letter' });

      const report = await run(source, target, { dryRun: true, deleteFromSource: true });

      expect(report).toMatchObject({ considered: 2, copied: 1, alreadyCopied: 1 });
      expect(target.calls.write).toEqual([]);
      expect(source.calls.remove).toEqual([]);
      expect(report.deletedFromSource).toBe(0);
    });
  });

  describe('deleting from the source', () => {
    it('removes a blob only after it is verified in the target', async () => {
      const source = makeStore({ [DOC]: 'cv bytes', [EXPORT]: 'export' });
      const target = makeStore();

      const report = await run(source, target, { deleteFromSource: true });

      expect(report.deletedFromSource).toBe(2);
      expect(source.blobs.size).toBe(0);
      expect(target.blobs.size).toBe(2);
    });

    it('also removes one that was copied by an earlier run', async () => {
      const source = makeStore({ [DOC]: 'cv bytes' });
      const target = makeStore({ [DOC]: 'cv bytes' });

      const report = await run(source, target, { deleteFromSource: true });

      expect(report).toMatchObject({ alreadyCopied: 1, deletedFromSource: 1 });
      expect(source.blobs.has(DOC)).toBe(false);
    });

    it('keeps the public copy when the target does not hold what was read', async () => {
      const source = makeStore({ [DOC]: 'cv bytes' });
      // A write that "succeeds" but stores the wrong number of bytes.
      const target = makeStore({}, 1000, {
        async write(pathname) {
          target.blobs.set(pathname, { data: Buffer.from('trunc'), contentType: 'x' });
        },
      });

      const report = await run(source, target, { deleteFromSource: true });

      expect(report.copied).toBe(0);
      expect(report.failures).toEqual([
        { pathname: DOC, reason: expect.stringContaining('target holds 5, read 8 bytes') },
      ]);
      expect(source.blobs.has(DOC)).toBe(true);
      expect(source.calls.remove).toEqual([]);
    });

    it('removes in batches of 100', async () => {
      const bodies = Object.fromEntries(
        Array.from({ length: 250 }, (_, i) => [`users/u1/applications/a1/f${i}.pdf`, `b${i}`]),
      );
      const source = makeStore(bodies, 1000);

      const report = await run(source, makeStore(), { deleteFromSource: true });

      expect(report.deletedFromSource).toBe(250);
      expect(source.calls.remove.map((batch) => batch.length)).toEqual([100, 100, 50]);
    });

    it('reports a failed delete and keeps going', async () => {
      const source = makeStore({ [DOC]: 'cv bytes' }, 1000, {
        remove: vi.fn().mockRejectedValue(new Error('delete refused')),
      });

      const report = await run(source, makeStore(), { deleteFromSource: true });

      expect(report.copied).toBe(1);
      expect(report.deletedFromSource).toBe(0);
      expect(report.failures).toEqual([{ pathname: DOC, reason: 'delete failed: delete refused' }]);
    });
  });

  describe('failures', () => {
    it('does not let one failing blob stop the rest', async () => {
      const source = makeStore({ [DOC]: 'cv bytes', [DOC_2]: 'letter' });
      const read = source.read.bind(source);
      source.read = vi
        .fn()
        .mockImplementation((pathname: string) =>
          pathname === DOC ? Promise.reject(new Error('read timed out')) : read(pathname),
        );
      const target = makeStore();

      const report = await run(source, target, { deleteFromSource: true });

      expect(report.failures).toEqual([{ pathname: DOC, reason: 'read timed out' }]);
      expect(report).toMatchObject({ copied: 1, deletedFromSource: 1 });
      expect(source.blobs.has(DOC)).toBe(true);
      expect(source.blobs.has(DOC_2)).toBe(false);
    });

    it('reports a blob that vanished between the listing and the read', async () => {
      const source = makeStore({ [DOC]: 'cv bytes' }, 1000, {
        read: vi.fn().mockResolvedValue(null),
      });

      const report = await run(source, makeStore());

      expect(report.failures).toEqual([
        { pathname: DOC, reason: 'vanished from the source before it was read' },
      ]);
    });
  });

  it('reports an empty source as nothing to do', async () => {
    expect(await run(makeStore(), makeStore())).toEqual({
      considered: 0,
      skippedPublic: 0,
      alreadyCopied: 0,
      copied: 0,
      deletedFromSource: 0,
      failures: [],
    });
  });
});
