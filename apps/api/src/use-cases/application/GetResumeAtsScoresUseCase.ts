import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IResumeAtsScoreRepository } from '#src/use-cases/ports/IResumeAtsScoreRepository.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import type { AtsScoreView } from '#src/use-cases/application/ComputeResumeAtsScoreUseCase.js';

export interface GetResumeAtsScoresInput {
  userId: string;
  applicationId: string;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  documentDraftRepository: IDocumentDraftRepository;
  resumeAtsScoreRepository: IResumeAtsScoreRepository;
}

/**
 * The saved ATS-readiness results for an application's resumes, each flagged
 * stale when the resume's text no longer hashes to what was scored. Uploaded
 * files are immutable (a re-upload is a new document with its own result), so
 * only draft results can be stale.
 */
export class GetResumeAtsScoresUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetResumeAtsScoresInput): Promise<AtsScoreView[]> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const [scores, drafts] = await Promise.all([
      this.deps.resumeAtsScoreRepository.findByApplicationId(input.applicationId),
      this.deps.documentDraftRepository.findAllByApplicationId(input.applicationId),
    ]);
    const draftHashes = new Map(drafts.map((d) => [d.id, hashResumeText(d.plainText)]));

    return scores.map((saved) => ({
      ...saved,
      isStale:
        saved.documentDraftId !== null &&
        draftHashes.get(saved.documentDraftId) !== saved.resumeTextHash,
    }));
  }
}
