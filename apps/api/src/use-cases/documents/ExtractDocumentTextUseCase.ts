import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';
import { readStoredObject } from '#src/use-cases/documents/readStoredObject.js';

export interface ExtractDocumentTextQuery {
  userId: string;
  documentId: string;
}

export interface ExtractDocumentTextResult {
  text: string;
}

export interface IExtractDocumentTextUseCase {
  execute(query: ExtractDocumentTextQuery): Promise<ExtractDocumentTextResult>;
}

export class ExtractDocumentTextUseCase implements IExtractDocumentTextUseCase {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly applicationRepository: IApplicationRepository,
    private readonly documentTextExtractor: IDocumentTextExtractor,
    private readonly storageProvider: IStorageProvider,
  ) {}

  async execute(query: ExtractDocumentTextQuery): Promise<ExtractDocumentTextResult> {
    const doc = await this.documentRepository.findById(query.documentId);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }

    const app = await this.applicationRepository.findById(doc.applicationId);
    if (!app || app.userId !== query.userId) {
      throw new ForbiddenError('Not authorized');
    }

    const object = await this.storageProvider.getObject(doc.storageKey);
    if (!object) {
      throw new Error('Failed to read the document file');
    }
    const buffer = await readStoredObject(object);
    const text = await this.documentTextExtractor.extract(buffer, doc.mimeType);

    return { text };
  }
}
