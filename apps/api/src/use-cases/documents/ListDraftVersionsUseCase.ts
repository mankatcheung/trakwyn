import type { DocumentDraftVersion } from '#src/domain/documentDraft/DocumentDraftVersion.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { findOwnedDraft } from './draftSnapshot.js';

export interface ListDraftVersionsQuery {
  userId: string;
  draftId: string;
}

export interface IListDraftVersionsUseCase {
  execute(query: ListDraftVersionsQuery): Promise<DocumentDraftVersion[]>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
  applicationRepository: IApplicationRepository;
}

/** A draft's history, newest first, for its owner only (JEF-584). */
export class ListDraftVersionsUseCase implements IListDraftVersionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(query: ListDraftVersionsQuery): Promise<DocumentDraftVersion[]> {
    await findOwnedDraft(this.deps, query.userId, query.draftId);
    return this.deps.documentDraftVersionRepository.listByDraft(query.draftId);
  }
}
