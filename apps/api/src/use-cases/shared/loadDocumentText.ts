import { ServiceUnavailableError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { Document } from '#src/domain/document/Document.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IStorageProvider, StoredObject } from '#src/use-cases/ports/IStorageProvider.js';
import {
  readStoredObject,
  StoredObjectTooLargeError,
} from '#src/use-cases/documents/readStoredObject.js';
import { RESUME_TEXT_EXTRACTION } from '#src/use-cases/constants.js';
import { withTimeout } from '#src/use-cases/shared/withTimeout.js';

export interface DocumentTextDeps {
  storageProvider: IStorageProvider;
  documentTextExtractor: IDocumentTextExtractor;
}

/**
 * The text of an uploaded resume, read straight from storage rather than
 * through a URL (JEF-51). Bounded in time and size: the file is parsed on the
 * request path, and the upload cap is the size the parser was ever meant to
 * see. The size is checked against the declared length first and the bytes
 * actually read after, since a backend can omit or misstate it.
 *
 * The text can be empty (a scanned PDF); what that means is the caller's call.
 */
export async function loadDocumentText(
  deps: DocumentTextDeps,
  doc: Pick<Document, 'storageKey' | 'mimeType'>,
): Promise<string> {
  const buffer = await readResumeFile(deps.storageProvider, doc.storageKey);
  return withTimeout(
    deps.documentTextExtractor.extract(buffer, doc.mimeType),
    RESUME_TEXT_EXTRACTION.EXTRACT_TIMEOUT_MS,
    () => new ServiceUnavailableError('Reading the uploaded resume took too long'),
  );
}

async function readResumeFile(
  storageProvider: IStorageProvider,
  storageKey: string,
): Promise<Buffer> {
  const unavailable = () => new ServiceUnavailableError('Failed to read the uploaded resume file');
  let opened: StoredObject | null = null;
  try {
    return await withTimeout(
      (async () => {
        opened = await storageProvider.getObject(storageKey);
        if (!opened) throw unavailable();
        return readStoredObject(opened, RESUME_TEXT_EXTRACTION.MAX_BYTES);
      })(),
      RESUME_TEXT_EXTRACTION.FETCH_TIMEOUT_MS,
      unavailable,
    );
  } catch (error) {
    (opened as StoredObject | null)?.stream.destroy();
    if (error instanceof StoredObjectTooLargeError) {
      throw new ValidationError('The uploaded resume is too large to analyse');
    }
    throw error;
  }
}
