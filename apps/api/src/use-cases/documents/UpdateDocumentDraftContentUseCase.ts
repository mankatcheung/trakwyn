import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type {
  IDocumentDraftRepository,
  UpdateDocumentDraftContentData,
} from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import { snapshotDraft } from './draftSnapshot.js';
import { normaliseAiInstructions } from '#src/use-cases/shared/aiInstructions.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';

export interface UpdateDocumentDraftContentCommand {
  userId: string;
  draftId: string;
  contentJson: string;
  plainText: string;
  /** When provided, saved with the content; `null` clears it (JEF-506). */
  aiInstructions?: string | null;
  /**
   * The save carries an AI result that replaces the document (JEF-584), so the
   * content it replaces is kept first, whatever the autosave interval says.
   */
  replacedByAi?: boolean;
}

export interface IUpdateDocumentDraftContentUseCase {
  execute(command: UpdateDocumentDraftContentCommand): Promise<DocumentDraft>;
}

interface Deps {
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
  transactionManager?: ITransactionManager;
  now?: () => Date;
}

export class UpdateDocumentDraftContentUseCase implements IUpdateDocumentDraftContentUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(command: UpdateDocumentDraftContentCommand): Promise<DocumentDraft> {
    const aiInstructions =
      command.aiInstructions === undefined
        ? undefined
        : normaliseAiInstructions(command.aiInstructions);
    const draft = await this.deps.documentDraftRepository.findById(command.draftId);
    if (!draft) {
      throw new NotFoundError('Document draft not found');
    }

    const app = await this.deps.applicationRepository.findById(draft.applicationId);
    if (!app || app.userId !== command.userId) {
      throw new ForbiddenError('Not authorized');
    }

    const data: UpdateDocumentDraftContentData = {
      contentJson: command.contentJson,
      plainText: command.plainText,
      ...(aiInstructions !== undefined ? { aiInstructions } : {}),
    };

    // The content being replaced is kept (at most every few minutes while editing,
    // always before an AI replace), in the same transaction as the save (JEF-584).
    return runInTransaction(this.deps.transactionManager, async () => {
      if (command.contentJson !== draft.contentJson) {
        const now = (this.deps.now ?? (() => new Date()))();
        await snapshotDraft(
          this.deps,
          draft,
          command.replacedByAi ? 'ai' : 'autosave',
          command.replacedByAi ? {} : { onlyIfDueAt: now },
        );
      }
      return this.deps.documentDraftRepository.updateContent(command.draftId, data);
    });
  }
}
