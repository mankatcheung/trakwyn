import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { CV_IMPORT, CV_IMPORT_MIME_TYPES, MIME_TYPE } from '#src/use-cases/constants.js';

const BYTES_PER_MB = 1024 * 1024;

/** Also what the upload route answers when the multipart parser stops a file at the limit. */
export const CV_TOO_LARGE_MESSAGE = `The file is larger than ${Math.round(CV_IMPORT.MAX_BYTES / BYTES_PER_MB)} MB`;

const PDF_SIGNATURE = Buffer.from('%PDF-');
// A DOCX is a ZIP archive, so it opens with the local file header.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const UNSUPPORTED_TYPE_MESSAGE = 'Upload your CV as a PDF, DOCX or TXT file';
const DOC_MESSAGE = "Old Word .doc files aren't supported. Save it as .docx or PDF and try again.";
const MISMATCH_MESSAGE = "This file doesn't match its file type. Upload a PDF, DOCX or TXT file.";

/**
 * The server-side checks on an uploaded CV (JEF-461). The browser repeats the
 * type and size checks for a faster answer, but these are the ones that count:
 * the declared type and length are the client's claim, the bytes are not.
 *
 * Messages never include the file's name or contents.
 */
export function assertCvMimeType(mimeType: string): void {
  if (mimeType === MIME_TYPE.DOC) throw new ValidationError(DOC_MESSAGE);
  if (!(CV_IMPORT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ValidationError(UNSUPPORTED_TYPE_MESSAGE);
  }
}

export function assertCvSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ValidationError('The file is empty');
  }
  if (sizeBytes > CV_IMPORT.MAX_BYTES) throw new ValidationError(CV_TOO_LARGE_MESSAGE);
}

export function assertCvMagicBytes(buffer: Buffer, mimeType: string): void {
  switch (mimeType) {
    case MIME_TYPE.PDF:
      return assertStartsWith(buffer, PDF_SIGNATURE);
    case MIME_TYPE.DOCX:
      return assertStartsWith(buffer, ZIP_SIGNATURE);
    case MIME_TYPE.TEXT_PLAIN:
      return assertPlainText(buffer);
    default:
      throw new ValidationError(UNSUPPORTED_TYPE_MESSAGE);
  }
}

/** Type, then size of the bytes actually received, then the content's own signature. */
export function assertCvFile(buffer: Buffer, mimeType: string): void {
  assertCvMimeType(mimeType);
  assertCvSize(buffer.byteLength);
  assertCvMagicBytes(buffer, mimeType);
}

function assertStartsWith(buffer: Buffer, signature: Buffer): void {
  if (
    buffer.byteLength < signature.byteLength ||
    !buffer.subarray(0, signature.byteLength).equals(signature)
  ) {
    throw new ValidationError(MISMATCH_MESSAGE);
  }
}

function assertPlainText(buffer: Buffer): void {
  if (buffer.includes(0)) throw new ValidationError(MISMATCH_MESSAGE);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new ValidationError(MISMATCH_MESSAGE);
  }
}
