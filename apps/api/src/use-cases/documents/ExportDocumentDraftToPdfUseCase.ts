import type { Document } from '#src/domain/document/Document.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type {
  IDocumentRepository,
  CreateDocumentData,
} from '#src/use-cases/ports/IDocumentRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IPdfRenderer } from '#src/use-cases/ports/IPdfRenderer.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';

export interface ExportDocumentDraftToPdfCommand {
  userId: string;
  draftId: string;
}

export interface IExportDocumentDraftToPdfUseCase {
  execute(command: ExportDocumentDraftToPdfCommand): Promise<Document>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  documentRepository: IDocumentRepository;
  applicationRepository: IApplicationRepository;
  storageProvider: IStorageProvider;
  pdfRenderer: IPdfRenderer;
  entitlementService: IEntitlementService;
  generateId: () => string;
}

export class ExportDocumentDraftToPdfUseCase implements IExportDocumentDraftToPdfUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: ExportDocumentDraftToPdfCommand): Promise<Document> {
    const draft = await this.deps.documentDraftRepository.findById(command.draftId);
    if (!draft) {
      throw new NotFoundError('Document draft not found');
    }

    const app = await this.deps.applicationRepository.findById(draft.applicationId);
    if (!app || app.userId !== command.userId) {
      throw new ForbiddenError('Not authorized');
    }

    const { limits } = await this.deps.entitlementService.forUserId(command.userId);

    const pdfBuffer = await this.deps.pdfRenderer.render({
      title: draft.title,
      contentJson: draft.contentJson,
    });

    const docId = this.deps.generateId();
    const storageKey = `documents/${draft.applicationId}/${docId}.pdf`;
    const fileName = `${draft.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    await this.deps.storageProvider.putObject(storageKey, pdfBuffer, 'application/pdf');

    const createData: CreateDocumentData = {
      id: docId,
      applicationId: draft.applicationId,
      name: fileName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      storageKey,
      documentType: draft.type,
      sourceDraftId: draft.id,
      storageLimitBytes: limits.documentBytes,
    };

    try {
      return await this.deps.documentRepository.create(createData);
    } catch (error) {
      await this.deps.storageProvider.delete(storageKey);
      throw error;
    }
  }
}
