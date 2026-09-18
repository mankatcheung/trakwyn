import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageProvider } from '#src/infrastructure/storage/LocalStorageProvider.js';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
  },
  createReadStream: vi.fn(),
}));

import { promises as fs, createReadStream, type Stats } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

function fileStats(size: number): Stats {
  return { isFile: () => true, size } as Stats;
}

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PORT;
});

describe('LocalStorageProvider', () => {
  describe('getPresignedUploadUrl', () => {
    it('creates the parent directory for the key', async () => {
      const provider = new LocalStorageProvider();
      await provider.getPresignedUploadUrl('users/u1/apps/app-1/file.pdf');

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('users/u1/apps/app-1'), {
        recursive: true,
      });
    });

    it('returns a URL containing the encoded key', async () => {
      const provider = new LocalStorageProvider();
      const url = await provider.getPresignedUploadUrl('some key/file.pdf');

      expect(url).toContain('_upload');
      expect(url).toContain(encodeURIComponent('some key/file.pdf'));
    });

    it('uses PORT env var when set', async () => {
      process.env.PORT = '4000';
      const provider = new LocalStorageProvider();
      const url = await provider.getPresignedUploadUrl('file.pdf');

      expect(url).toContain(':4000');
    });

    it('falls back to port 3001 when PORT is not set', async () => {
      const provider = new LocalStorageProvider();
      const url = await provider.getPresignedUploadUrl('file.pdf');

      expect(url).toContain(':3001');
    });
  });

  describe('getSignedUrl', () => {
    it('returns a URL containing the key', async () => {
      const provider = new LocalStorageProvider();
      const url = await provider.getSignedUrl('users/u1/resume.pdf');

      expect(url).toContain('users/u1/resume.pdf');
      expect(url).toContain('/uploads/');
    });
  });

  describe('delete', () => {
    it('calls unlink with the correct file path', async () => {
      const provider = new LocalStorageProvider();
      await provider.delete('users/u1/resume.pdf');

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('users/u1/resume.pdf'));
    });

    it('swallows errors when the file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('ENOENT'));
      const provider = new LocalStorageProvider();

      await expect(provider.delete('missing.pdf')).resolves.toBeUndefined();
    });
  });
  describe('deleteMany', () => {
    it('unlinks every key', async () => {
      const provider = new LocalStorageProvider();
      await provider.deleteMany(['a/one.pdf', 'b/two.pdf']);

      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('a/one.pdf'));
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('b/two.pdf'));
    });

    it('does not touch the filesystem for an empty batch', async () => {
      const provider = new LocalStorageProvider();
      await provider.deleteMany([]);

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('keeps deleting after one key fails, matching single delete being best-effort', async () => {
      vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('ENOENT'));
      const provider = new LocalStorageProvider();

      await expect(provider.deleteMany(['gone.pdf', 'here.pdf'])).resolves.toBeUndefined();
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveKeyPath', () => {
    it('maps a key to a path inside the upload dir', () => {
      const provider = new LocalStorageProvider();

      expect(provider.resolveKeyPath('documents/app-1/doc-1.pdf')).toBe(
        join(UPLOAD_DIR, 'documents/app-1/doc-1.pdf'),
      );
    });

    it.each([
      ['a parent-directory segment', '../secret.txt'],
      ['a nested parent-directory segment', 'users/u1/../../../etc/passwd'],
      ['a backslash traversal', 'users\\..\\..\\secret.txt'],
      ['an absolute path', '/etc/passwd'],
      ['a NUL byte', 'users/u1/file.pdf\0.txt'],
      ['an empty key', ''],
      ['the upload dir itself', '.'],
    ])('rejects %s', (_label, key) => {
      const provider = new LocalStorageProvider();

      expect(provider.resolveKeyPath(key)).toBeNull();
    });
  });

  describe('openObject', () => {
    it('returns a stream, size and content type for a stored file', async () => {
      const stream = { fake: 'stream' };
      vi.mocked(fs.stat).mockResolvedValueOnce(fileStats(42));
      vi.mocked(createReadStream).mockReturnValueOnce(stream as never);
      const provider = new LocalStorageProvider();

      const object = await provider.openObject('documents/app-1/doc-1.pdf');

      expect(object).toEqual({ stream, size: 42, contentType: 'application/pdf' });
      expect(createReadStream).toHaveBeenCalledWith(join(UPLOAD_DIR, 'documents/app-1/doc-1.pdf'));
    });

    it.each([
      ['report.DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['notes.txt', 'text/plain; charset=utf-8'],
      ['archive.zip', 'application/octet-stream'],
      ['no-extension', 'application/octet-stream'],
    ])('derives the content type of %s from its extension', async (name, contentType) => {
      vi.mocked(fs.stat).mockResolvedValueOnce(fileStats(1));
      const provider = new LocalStorageProvider();

      const object = await provider.openObject(`users/u1/applications/a1/${name}`);

      expect(object?.contentType).toBe(contentType);
    });

    it('returns null without touching the filesystem for an invalid key', async () => {
      const provider = new LocalStorageProvider();

      await expect(provider.openObject('../secret.txt')).resolves.toBeNull();
      expect(fs.stat).not.toHaveBeenCalled();
    });

    it('returns null when no file exists at the key', async () => {
      vi.mocked(fs.stat).mockRejectedValueOnce(errnoError('ENOENT'));
      const provider = new LocalStorageProvider();

      await expect(provider.openObject('users/u1/missing.pdf')).resolves.toBeNull();
      expect(createReadStream).not.toHaveBeenCalled();
    });

    it('returns null when the key names a directory', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({ isFile: () => false, size: 0 } as Stats);
      const provider = new LocalStorageProvider();

      await expect(provider.openObject('users/u1')).resolves.toBeNull();
    });

    it('rethrows a filesystem error other than a missing file', async () => {
      vi.mocked(fs.stat).mockRejectedValueOnce(errnoError('EACCES'));
      const provider = new LocalStorageProvider();

      await expect(provider.openObject('users/u1/locked.pdf')).rejects.toThrow('EACCES');
    });
  });
});
