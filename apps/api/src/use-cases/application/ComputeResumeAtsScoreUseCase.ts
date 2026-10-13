import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { AtsScoreResult } from '#src/domain/resume/AtsScore.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { MIME_TYPE } from '#src/use-cases/constants.js';
import { loadDocumentText } from '#src/use-cases/shared/loadDocumentText.js';
import { scoreResumeText } from '#src/use-cases/shared/scoreResumeText.js';

export interface ComputeResumeAtsScoreInput {
  userId: string;
  /** The resume to score: a draft or an uploaded file, exactly one. */
  documentDraftId?: string | null;
  documentId?: string | null;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  documentDraftRepository: IDocumentDraftRepository;
  storageProvider: IStorageProvider;
  documentTextExtractor: IDocumentTextExtractor;
  computeResumeAtsScoreRateLimiter: IRateLimiter;
}

const RESUME_DOCUMENT_TYPE = 'resume';
const IMAGE_MIME_TYPES: readonly string[] = [MIME_TYPE.PNG, MIME_TYPE.JPEG];

/**
 * Scores how readable a resume is to an applicant tracking system. Unlike the
 * match score it needs no job description and no AI key, and nothing is saved:
 * the score is cheap and exact, so it is recomputed on request.
 */
export class ComputeResumeAtsScoreUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ComputeResumeAtsScoreInput): Promise<AtsScoreResult> {
    if (!input.documentDraftId === !input.documentId) {
      throw new ValidationError('Choose exactly one resume to score');
    }

    if (
      !(await this.deps.computeResumeAtsScoreRateLimiter.consume(`resume-ats:user:${input.userId}`))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    return scoreResumeText(await this.resolveResumeText(input));
  }

  private async resolveResumeText(input: ComputeResumeAtsScoreInput): Promise<string> {
    if (input.documentDraftId) {
      const draft = await this.deps.documentDraftRepository.findById(input.documentDraftId);
      if (!draft || draft.type !== RESUME_DOCUMENT_TYPE) {
        throw new NotFoundError('Resume not found');
      }
      await this.assertOwnsApplication(draft.applicationId, input.userId);
      return draft.plainText;
    }

    const doc = await this.deps.documentRepository.findById(input.documentId as string);
    if (!doc || doc.documentType !== RESUME_DOCUMENT_TYPE) {
      throw new NotFoundError('Resume not found');
    }
    await this.assertOwnsApplication(doc.applicationId, input.userId);

    // A photo of a resume has no text for a parser to read, which is the
    // finding itself, so it is scored as such rather than refused.
    if (IMAGE_MIME_TYPES.includes(doc.mimeType)) return '';
    return loadDocumentText(this.deps, doc);
  }

  private async assertOwnsApplication(applicationId: string, userId: string): Promise<void> {
    const app = await this.deps.applicationRepository.findById(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== userId) throw new ForbiddenError('Forbidden');
  }
}
