import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import type {
  IPermanentlyDeleteApplicationUseCase,
  PermanentlyDeleteApplicationInput,
} from '#src/use-cases/jobs/IPermanentlyDeleteApplicationUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  storageProvider: IStorageProvider;
  interviewRoundRepository: IInterviewRoundRepository;
  syncCalendarEventUseCase?: ISyncCalendarEventUseCase;
}

/**
 * The only path that actually destroys an application, used both by "Delete
 * permanently" in Trash and by the nightly purge — one implementation rather
 * than two that drift apart.
 *
 * Blobs go before rows. Reversing that order loses the storage keys to the
 * cascade and orphans the files, which nothing would ever notice.
 *
 * The application's interview rounds go with it (cascade), so their Google
 * Calendar events are removed too (JEF-331). Moving to Trash does not do this:
 * it is reversible, and the events stay until this runs. Empty Trash and the
 * purge both come through here, so this is the one place that handles it. The
 * round ids are read before the delete, since the rows are gone afterwards.
 *
 * The purge passes the owner's own id rather than skipping the check, so there
 * is no code path here that deletes without establishing ownership.
 */
export class PermanentlyDeleteApplicationUseCase implements IPermanentlyDeleteApplicationUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: PermanentlyDeleteApplicationInput): Promise<void> {
    const app = await this.deps.applicationRepository.findByIdIncludingTrashed(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const documents = await this.deps.documentRepository.findAllByApplicationId(
      input.applicationId,
    );
    await this.deps.storageProvider.deleteMany(documents.map((doc) => doc.storageKey));

    const rounds = await this.deps.interviewRoundRepository.findAllByApplicationId(
      input.applicationId,
    );

    await this.deps.applicationRepository.delete(input.applicationId);

    await this.deps.syncCalendarEventUseCase?.removeMany({
      userId: input.userId,
      sourceType: 'interview',
      sourceIds: rounds.map((round) => round.id),
    });
  }
}
