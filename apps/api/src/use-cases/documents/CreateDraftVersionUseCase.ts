import type { DocumentDraftVersion } from '#src/domain/documentDraft/DocumentDraftVersion.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { findOwnedDraft, snapshotDraft } from './draftSnapshot.js';

export interface CreateDraftVersionCommand {
  userId: string;
  draftId: string;
}

export interface ICreateDraftVersionUseCase {
  execute(command: CreateDraftVersionCommand): Promise<DocumentDraftVersion>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
  applicationRepository: IApplicationRepository;
  transactionManager?: ITransactionManager;
}

/** "Save version": keeps the draft's saved content as it is now (JEF-584). */
export class CreateDraftVersionUseCase implements ICreateDraftVersionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: CreateDraftVersionCommand): Promise<DocumentDraftVersion> {
    const draft = await findOwnedDraft(this.deps, command.userId, command.draftId);
    if (draft.plainText.trim() === '') {
      throw new ValidationError('There is nothing to save yet');
    }
    return runInTransaction(this.deps.transactionManager, async () => {
      const created = await snapshotDraft(this.deps, draft, 'manual');
      if (created) return created;
      // Nothing changed since the newest version, which already is this content.
      const latest = await this.deps.documentDraftVersionRepository.findLatestByDraft(draft.id);
      if (!latest) throw new ValidationError('There is nothing to save yet');
      return latest;
    });
  }
}
