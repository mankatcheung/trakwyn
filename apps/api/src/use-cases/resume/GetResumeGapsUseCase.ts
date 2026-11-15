import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IPostingRequirementsRepository } from '#src/use-cases/ports/IPostingRequirementsRepository.js';
import type { IResumeGapDismissalRepository } from '#src/use-cases/ports/IResumeGapDismissalRepository.js';
import { findResumeGaps, type ResumeGaps } from '#src/use-cases/resume/resumeGaps.js';
import {
  loadUserProfile,
  type UserProfileRepositories,
} from '#src/use-cases/shared/userProfile.js';

export interface GetResumeGapsInput {
  userId: string;
  applicationId: string;
}

export interface IGetResumeGapsUseCase {
  execute(input: GetResumeGapsInput): Promise<ResumeGaps>;
}

interface Deps extends UserProfileRepositories {
  applicationRepository: IApplicationRepository;
  postingRequirementsRepository: IPostingRequirementsRepository;
  resumeGapDismissalRepository: IResumeGapDismissalRepository;
}

/**
 * The questions that would strengthen a resume for this application (JEF-594):
 * what the posting asks for that the profile does not show, and which roles
 * have no number in them. Computed in code from saved data, so it never calls
 * a model and costs nothing to show.
 *
 * The posting's keywords come from the saved `PostingRequirements` even when
 * the posting has been edited since: a slightly old list is still a useful
 * question, and reading it again is the overview panel's job.
 */
export class GetResumeGapsUseCase implements IGetResumeGapsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetResumeGapsInput): Promise<ResumeGaps> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const [requirements, profile, dismissedKeys] = await Promise.all([
      this.deps.postingRequirementsRepository.findByApplicationId(input.applicationId),
      loadUserProfile(this.deps, input.userId),
      this.deps.resumeGapDismissalRepository.findKeysByApplicationId(input.applicationId),
    ]);

    return findResumeGaps({ keywords: requirements?.keywords ?? null, profile, dismissedKeys });
  }
}
