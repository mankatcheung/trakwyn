import type { IListDraftVersionsUseCase } from '#src/use-cases/documents/ListDraftVersionsUseCase.js';
import type { IGetDraftVersionUseCase } from '#src/use-cases/documents/GetDraftVersionUseCase.js';
import type { ICreateDraftVersionUseCase } from '#src/use-cases/documents/CreateDraftVersionUseCase.js';
import type { IRestoreDraftVersionUseCase } from '#src/use-cases/documents/RestoreDraftVersionUseCase.js';
import type {
  DocumentDraftVersionMapper,
  DocumentDraftVersionDTO,
} from '#src/interface-adapters/mappers/DocumentDraftVersionMapper.js';
import type {
  DocumentDraftMapper,
  DocumentDraftDTO,
} from '#src/interface-adapters/mappers/DocumentDraftMapper.js';

interface Deps {
  listDraftVersionsUseCase: IListDraftVersionsUseCase;
  getDraftVersionUseCase: IGetDraftVersionUseCase;
  createDraftVersionUseCase: ICreateDraftVersionUseCase;
  restoreDraftVersionUseCase: IRestoreDraftVersionUseCase;
  documentDraftVersionMapper: DocumentDraftVersionMapper;
  documentDraftMapper: DocumentDraftMapper;
}

/** Draft history (JEF-584): the versions of a draft, saving one and restoring one. */
export class DraftHistoryResolver {
  constructor(private readonly deps: Deps) {}

  async getVersions(userId: string, draftId: string): Promise<DocumentDraftVersionDTO[]> {
    const versions = await this.deps.listDraftVersionsUseCase.execute({ userId, draftId });
    return versions.map((v) => this.deps.documentDraftVersionMapper.toDTO(v));
  }

  async getVersion(userId: string, versionId: string): Promise<DocumentDraftVersionDTO> {
    const version = await this.deps.getDraftVersionUseCase.execute({ userId, versionId });
    return this.deps.documentDraftVersionMapper.toDTO(version);
  }

  async createVersion(userId: string, draftId: string): Promise<DocumentDraftVersionDTO> {
    const version = await this.deps.createDraftVersionUseCase.execute({ userId, draftId });
    return this.deps.documentDraftVersionMapper.toDTO(version);
  }

  async restoreVersion(userId: string, versionId: string): Promise<DocumentDraftDTO> {
    const draft = await this.deps.restoreDraftVersionUseCase.execute({ userId, versionId });
    return this.deps.documentDraftMapper.toDTO(draft);
  }
}
