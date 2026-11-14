import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { findOwnedDraft, snapshotDraft } from './draftSnapshot.js';

export interface RestoreDraftVersionCommand {
  userId: string;
  versionId: string;
}

export interface IRestoreDraftVersionUseCase {
  execute(command: RestoreDraftVersionCommand): Promise<DocumentDraft>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
  applicationRepository: IApplicationRepository;
  transactionManager?: ITransactionManager;
}

/**
 * Puts an earlier version's content back as the draft's content (JEF-584). The
 * content it replaces is kept first, so a restore can itself be undone; both
 * writes stand or fall together.
 */
export class RestoreDraftVersionUseCase implements IRestoreDraftVersionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: RestoreDraftVersionCommand): Promise<DocumentDraft> {
    const version = await this.deps.documentDraftVersionRepository.findById(command.versionId);
    if (!version) throw new NotFoundError('Draft version not found');
    const draft = await findOwnedDraft(this.deps, command.userId, version.draftId);

    return runInTransaction(this.deps.transactionManager, async () => {
      await snapshotDraft(this.deps, draft, 'restore');
      return this.deps.documentDraftRepository.updateContent(draft.id, {
        contentJson: version.contentJson,
        plainText: version.plainText,
      });
    });
  }
}
