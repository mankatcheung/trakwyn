import type { DocumentDraftVersion } from '#src/domain/documentDraft/DocumentDraftVersion.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { findOwnedDraft } from './draftSnapshot.js';

export interface GetDraftVersionQuery {
  userId: string;
  versionId: string;
}

export interface IGetDraftVersionUseCase {
  execute(query: GetDraftVersionQuery): Promise<DocumentDraftVersion>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
  applicationRepository: IApplicationRepository;
}

/** One version with its content, for the read-only preview (JEF-584). */
export class GetDraftVersionUseCase implements IGetDraftVersionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(query: GetDraftVersionQuery): Promise<DocumentDraftVersion> {
    const version = await this.deps.documentDraftVersionRepository.findById(query.versionId);
    if (!version) throw new NotFoundError('Draft version not found');
    await findOwnedDraft(this.deps, query.userId, version.draftId);
    return version;
  }
}
