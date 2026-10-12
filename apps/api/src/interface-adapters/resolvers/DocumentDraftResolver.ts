import type { ICreateDocumentDraftUseCase } from '#src/use-cases/documents/CreateDocumentDraftUseCase.js';
import type { IUpdateDocumentDraftContentUseCase } from '#src/use-cases/documents/UpdateDocumentDraftContentUseCase.js';
import type { IRenameDocumentDraftUseCase } from '#src/use-cases/documents/RenameDocumentDraftUseCase.js';
import type { IGenerateCoverLetterDraftUseCase } from '#src/use-cases/documents/GenerateCoverLetterDraftUseCase.js';
import type { IGenerateResumeDraftUseCase } from '#src/use-cases/documents/GenerateResumeDraftUseCase.js';
import type { IGetDocumentDraftsUseCase } from '#src/use-cases/documents/GetDocumentDraftsUseCase.js';
import type { IGetDocumentDraftUseCase } from '#src/use-cases/documents/GetDocumentDraftUseCase.js';
import type { IDeleteDocumentDraftUseCase } from '#src/use-cases/documents/DeleteDocumentDraftUseCase.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import type { IExportDocumentDraftToPdfUseCase } from '#src/use-cases/documents/ExportDocumentDraftToPdfUseCase.js';
import type {
  DocumentDraftMapper,
  DocumentDraftDTO,
} from '#src/interface-adapters/mappers/DocumentDraftMapper.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { DocumentDTO } from '#src/interface-adapters/mappers/DocumentMapper.js';

interface Deps {
  createDocumentDraftUseCase: ICreateDocumentDraftUseCase;
  updateDocumentDraftContentUseCase: IUpdateDocumentDraftContentUseCase;
  renameDocumentDraftUseCase: IRenameDocumentDraftUseCase;
  generateCoverLetterDraftUseCase: IGenerateCoverLetterDraftUseCase;
  generateResumeDraftUseCase: IGenerateResumeDraftUseCase;
  getDocumentDraftsUseCase: IGetDocumentDraftsUseCase;
  getDocumentDraftUseCase: IGetDocumentDraftUseCase;
  deleteDocumentDraftUseCase: IDeleteDocumentDraftUseCase;
  extractDocumentTextUseCase: IExtractDocumentTextUseCase;
  exportDocumentDraftToPdfUseCase: IExportDocumentDraftToPdfUseCase;
  documentDraftMapper: DocumentDraftMapper;
  documentRepository: IDocumentRepository;
  storageProvider: IStorageProvider;
}

interface CreateInput {
  applicationId: string;
  type: string;
  title: string;
  contentJson?: string | null;
  plainText?: string | null;
  sourceDocumentId?: string | null;
}

interface UpdateContentInput {
  draftId: string;
  contentJson: string;
  plainText: string;
}

export class DocumentDraftResolver {
  constructor(private readonly deps: Deps) {}

  async getDocumentDrafts(userId: string, applicationId: string): Promise<DocumentDraftDTO[]> {
    const drafts = await this.deps.getDocumentDraftsUseCase.execute({ userId, applicationId });
    return drafts.map((d) => this.deps.documentDraftMapper.toDTO(d));
  }

  async getDocumentDraft(userId: string, draftId: string): Promise<DocumentDraftDTO> {
    const draft = await this.deps.getDocumentDraftUseCase.execute({ userId, draftId });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async createDocumentDraft(userId: string, input: CreateInput): Promise<DocumentDraftDTO> {
    const draft = await this.deps.createDocumentDraftUseCase.execute({
      userId,
      applicationId: input.applicationId,
      type: input.type as 'cover_letter' | 'resume',
      title: input.title,
      contentJson: input.contentJson ?? undefined,
      plainText: input.plainText ?? undefined,
      sourceDocumentId: input.sourceDocumentId ?? null,
    });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async updateDocumentDraftContent(
    userId: string,
    input: UpdateContentInput,
  ): Promise<DocumentDraftDTO> {
    const draft = await this.deps.updateDocumentDraftContentUseCase.execute({
      userId,
      draftId: input.draftId,
      contentJson: input.contentJson,
      plainText: input.plainText,
    });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async renameDocumentDraft(
    userId: string,
    draftId: string,
    title: string,
  ): Promise<DocumentDraftDTO> {
    const draft = await this.deps.renameDocumentDraftUseCase.execute({ userId, draftId, title });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async generateCoverLetterDraft(
    userId: string,
    applicationId: string,
    resume?: {
      resumeText?: string | null;
      resumeDocumentId?: string | null;
      resumeDraftId?: string | null;
    },
  ): Promise<DocumentDraftDTO> {
    const draft = await this.deps.generateCoverLetterDraftUseCase.execute({
      userId,
      applicationId,
      resumeText: resume?.resumeText,
      resumeDocumentId: resume?.resumeDocumentId,
      resumeDraftId: resume?.resumeDraftId,
    });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async generateResumeDraft(userId: string, applicationId: string): Promise<DocumentDraftDTO> {
    const draft = await this.deps.generateResumeDraftUseCase.execute({ userId, applicationId });
    return this.deps.documentDraftMapper.toDTO(draft);
  }

  async deleteDocumentDraft(userId: string, draftId: string): Promise<boolean> {
    await this.deps.deleteDocumentDraftUseCase.execute({ userId, draftId });
    return true;
  }

  async extractDocumentText(userId: string, documentId: string): Promise<{ text: string }> {
    return this.deps.extractDocumentTextUseCase.execute({ userId, documentId });
  }

  async exportDocumentDraftToPdf(userId: string, draftId: string): Promise<DocumentDTO> {
    const doc = await this.deps.exportDocumentDraftToPdfUseCase.execute({ userId, draftId });
    const url = await this.deps.storageProvider.getSignedUrl(doc.storageKey);
    const { DocumentMapper } = await import('#src/interface-adapters/mappers/DocumentMapper.js');
    const mapper = new DocumentMapper();
    return mapper.toDTO(doc, url);
  }
}
