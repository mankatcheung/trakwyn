import { nanoid } from 'nanoid';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type {
  DocumentDraftVersion,
  DraftVersionSource,
} from '#src/domain/documentDraft/DocumentDraftVersion.js';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import { DRAFT_HISTORY } from '#src/use-cases/constants.js';
import { NotFoundError, ForbiddenError } from '#src/use-cases/errors/DomainError.js';

interface SnapshotDeps {
  documentDraftVersionRepository: IDocumentDraftVersionRepository;
}

interface SnapshotOptions {
  /**
   * Only take it when the newest snapshot is older than the autosave interval,
   * so editing does not fill the history. Absent means always (an AI replace,
   * Save version, Restore).
   */
  onlyIfDueAt?: Date;
}

/**
 * Keeps a copy of the draft's current content (JEF-584), then trims the
 * history to its cap. Returns null when there is nothing worth keeping: a blank
 * draft, content the newest snapshot already holds, or (with `onlyIfDueAt`) a
 * snapshot that is not due yet.
 */
export async function snapshotDraft(
  { documentDraftVersionRepository }: SnapshotDeps,
  draft: DocumentDraft,
  source: DraftVersionSource,
  options: SnapshotOptions = {},
): Promise<DocumentDraftVersion | null> {
  if (draft.plainText.trim() === '') return null;

  const latest = await documentDraftVersionRepository.findLatestByDraft(draft.id);
  if (latest?.contentJson === draft.contentJson) return null;
  if (
    options.onlyIfDueAt &&
    latest &&
    options.onlyIfDueAt.getTime() - latest.createdAt.getTime() < DRAFT_HISTORY.AUTOSAVE_INTERVAL_MS
  ) {
    return null;
  }

  const version = await documentDraftVersionRepository.create({
    id: nanoid(),
    draftId: draft.id,
    contentJson: draft.contentJson,
    plainText: draft.plainText,
    source,
  });
  await documentDraftVersionRepository.pruneToLimit(draft.id, DRAFT_HISTORY.MAX_VERSIONS);
  return version;
}

interface OwnershipDeps {
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
}

/** The draft, if it exists and the user owns the application it sits on. */
export async function findOwnedDraft(
  { documentDraftRepository, applicationRepository }: OwnershipDeps,
  userId: string,
  draftId: string,
): Promise<DocumentDraft> {
  const draft = await documentDraftRepository.findById(draftId);
  if (!draft) throw new NotFoundError('Document draft not found');
  const app = await applicationRepository.findById(draft.applicationId);
  if (!app || app.userId !== userId) throw new ForbiddenError('Not authorized');
  return draft;
}
