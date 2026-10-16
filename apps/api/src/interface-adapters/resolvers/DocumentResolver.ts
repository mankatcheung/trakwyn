import type { IRequestUploadUrlUseCase } from '#src/use-cases/documents/IRequestUploadUrlUseCase.js';
import type { IConfirmDocumentUseCase } from '#src/use-cases/documents/IConfirmDocumentUseCase.js';
import type { IGetDocumentsUseCase } from '#src/use-cases/documents/IGetDocumentsUseCase.js';
import type { IDeleteDocumentUseCase } from '#src/use-cases/documents/IDeleteDocumentUseCase.js';
import type { StorageAccess } from '#src/use-cases/shared/storageAccess.js';
import type { IDocumentFileLinks } from '#src/use-cases/ports/IDocumentFileLinks.js';
import type {
  DocumentMapper,
  DocumentDTO,
} from '#src/interface-adapters/mappers/DocumentMapper.js';

interface Deps {
  requestUploadUrlUseCase: IRequestUploadUrlUseCase;
  confirmDocumentUseCase: IConfirmDocumentUseCase;
  getDocumentsUseCase: IGetDocumentsUseCase;
  deleteDocumentUseCase: IDeleteDocumentUseCase;
  documentFileLinks: IDocumentFileLinks;
  documentMapper: DocumentMapper;
}

interface UploadUrlPayload {
  uploadUrl: string;
  storageKey: string;
  access: StorageAccess;
}

interface ConfirmInput {
  applicationId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  documentType?: string;
  version?: string | null;
}

export class DocumentResolver {
  constructor(private readonly deps: Deps) {}

  async getDocuments(userId: string, applicationId: string): Promise<DocumentDTO[]> {
    const docs = await this.deps.getDocumentsUseCase.execute({ userId, applicationId });
    return docs.map((doc) =>
      this.deps.documentMapper.toDTO(doc, this.deps.documentFileLinks.urlFor(doc.id)),
    );
  }

  async requestUploadUrl(
    userId: string,
    applicationId: string,
    filename: string,
    mimeType: string,
  ): Promise<UploadUrlPayload> {
    return this.deps.requestUploadUrlUseCase.execute({
      userId,
      applicationId,
      filename,
      mimeType,
    });
  }

  async confirmDocument(userId: string, input: ConfirmInput): Promise<DocumentDTO> {
    const doc = await this.deps.confirmDocumentUseCase.execute({ userId, ...input });
    return this.deps.documentMapper.toDTO(doc, this.deps.documentFileLinks.urlFor(doc.id));
  }

  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    await this.deps.deleteDocumentUseCase.execute({ userId, documentId });
    return true;
  }
}
