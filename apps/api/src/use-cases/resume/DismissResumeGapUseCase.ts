import {
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IResumeGapDismissalRepository } from '#src/use-cases/ports/IResumeGapDismissalRepository.js';
import type { IGetResumeGapsUseCase } from '#src/use-cases/resume/GetResumeGapsUseCase.js';
import { normaliseGapKey, type ResumeGaps } from '#src/use-cases/resume/resumeGaps.js';
import { RESUME_GAPS } from '#src/use-cases/constants.js';

export interface DismissResumeGapInput {
  userId: string;
  applicationId: string;
  /** A requirement as it was shown, or `role:<workExperienceId>`. */
  key: string;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  resumeGapDismissalRepository: IResumeGapDismissalRepository;
  getResumeGapsUseCase: IGetResumeGapsUseCase;
  generateId: () => string;
}

/**
 * Records "no" to one gap question for an application (JEF-594) and returns
 * the questions that are left. It is per application: not having used
 * Kubernetes is true everywhere, but the question only comes up for a posting
 * that asks for it, and a profile that later gains the skill answers it anyway.
 */
export class DismissResumeGapUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: DismissResumeGapInput): Promise<ResumeGaps> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const key = normaliseGapKey(input.key);
    if (!key) throw new ValidationError('Choose which question to dismiss');
    if (key.length > RESUME_GAPS.KEY_MAX_CHARS) {
      throw new ValidationError(
        `A dismissed question must be at most ${RESUME_GAPS.KEY_MAX_CHARS} characters`,
      );
    }

    // The table is otherwise unbounded: the key is free text from the client.
    const existing = await this.deps.resumeGapDismissalRepository.countByApplicationId(
      input.applicationId,
    );
    if (existing >= RESUME_GAPS.MAX_DISMISSED_PER_APPLICATION) {
      throw new QuotaExceededError(
        `You have reached the maximum of ${RESUME_GAPS.MAX_DISMISSED_PER_APPLICATION} dismissed questions for this application`,
      );
    }

    await this.deps.resumeGapDismissalRepository.add({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      key,
    });
    return this.deps.getResumeGapsUseCase.execute({
      userId: input.userId,
      applicationId: input.applicationId,
    });
  }
}
