import { promises as fs, createReadStream } from 'fs';
import type { Readable } from 'stream';
import { join, dirname, extname, resolve, sep } from 'path';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import { ENV } from '#src/infrastructure/config/constants.js';

/** Extension → Content-Type for files served back by `openObject`. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
const FALLBACK_MIME = 'application/octet-stream';

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export interface LocalStoredObject {
  stream: Readable;
  size: number;
  contentType: string;
}

export class LocalStorageProvider implements IStorageProvider {
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.uploadDir = join(process.cwd(), 'uploads');
    this.baseUrl = `http://localhost:${process.env[ENV.PORT] ?? 3001}/uploads`;
  }

  async getPresignedUploadUrl(key: string): Promise<string> {
    const filePath = join(this.uploadDir, key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    // In local dev, return a URL that the API itself handles for the upload
    return `${this.baseUrl}/_upload/${encodeURIComponent(key)}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `${this.baseUrl}/${key}`;
  }

  /**
   * The absolute path a key maps to, or `null` when the key would land
   * outside the upload dir (`..` segments, an absolute path, a NUL byte).
   * Checked by resolving rather than by pattern, so an encoded or oddly
   * shaped traversal is caught the same way as a literal `../`.
   */
  resolveKeyPath(key: string): string | null {
    if (key === '' || key.includes('\0') || key.split(/[\\/]/).includes('..')) return null;
    const filePath = resolve(this.uploadDir, key);
    return filePath.startsWith(this.uploadDir + sep) ? filePath : null;
  }

  /**
   * Opens a stored file for reading — the counterpart of the URL
   * `getSignedUrl` hands out, served by the dev-only `GET /uploads/*` route.
   * Not on `IStorageProvider`: Vercel Blob serves its own URLs, so nothing
   * above infrastructure needs to read an object back. Returns `null` for a
   * key that is invalid or names no file.
   */
  async openObject(key: string): Promise<LocalStoredObject | null> {
    const filePath = this.resolveKeyPath(key);
    if (filePath === null) return null;

    let size: number;
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) return null;
      size = stats.size;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }

    return {
      stream: createReadStream(filePath),
      size,
      contentType: MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? FALLBACK_MIME,
    };
  }

  async putObject(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    // There is no batch unlink; the local provider is a dev convenience, so
    // parallel single deletes are as batched as this gets. `delete` already
    // swallows a missing file, so one bad key cannot fail the rest.
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}
