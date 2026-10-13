import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IResumeMatchRepository } from '#src/use-cases/ports/IResumeMatchRepository.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import type { ResumeMatchView } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';

export interface GetResumeMatchesInput {
  userId: string;
  applicationId: string;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  documentDraftRepository: IDocumentDraftRepository;
  resumeMatchRepository: IResumeMatchRepository;
}

/**
 * The saved matches for an application's resumes, each flagged stale when the
 * resume's text no longer hashes to what was scored. Uploaded files are
 * immutable (a re-upload is a new document with its own match), so only draft
 * matches can be stale.
 */
export class GetResumeMatchesUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetResumeMatchesInput): Promise<ResumeMatchView[]> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const [matches, drafts] = await Promise.all([
      this.deps.resumeMatchRepository.findByApplicationId(input.applicationId),
      this.deps.documentDraftRepository.findAllByApplicationId(input.applicationId),
    ]);
    const draftHashes = new Map(drafts.map((d) => [d.id, hashResumeText(d.plainText)]));

    return matches.map((match) => ({
      ...match,
      isStale:
        match.documentDraftId !== null &&
        draftHashes.get(match.documentDraftId) !== match.resumeTextHash,
    }));
  }
}
