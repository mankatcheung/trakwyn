import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { SavedAtsScore } from '#src/domain/resume/AtsScore.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { IResumeAtsScoreRepository } from '#src/use-cases/ports/IResumeAtsScoreRepository.js';
import { MIME_TYPE } from '#src/use-cases/constants.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import { loadDocumentText } from '#src/use-cases/shared/loadDocumentText.js';
import { scoreResumeText } from '#src/use-cases/shared/scoreResumeText.js';

export interface ComputeResumeAtsScoreInput {
  userId: string;
  /** The resume to score: a draft or an uploaded file, exactly one. */
  documentDraftId?: string | null;
  documentId?: string | null;
}

/** A saved result plus whether the resume has changed since it was scored. */
export interface AtsScoreView extends SavedAtsScore {
  isStale: boolean;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  documentDraftRepository: IDocumentDraftRepository;
  storageProvider: IStorageProvider;
  documentTextExtractor: IDocumentTextExtractor;
  resumeAtsScoreRepository: IResumeAtsScoreRepository;
  computeResumeAtsScoreRateLimiter: IRateLimiter;
  generateId: () => string;
  now: () => Date;
}

const RESUME_DOCUMENT_TYPE = 'resume';
const IMAGE_MIME_TYPES: readonly string[] = [MIME_TYPE.PNG, MIME_TYPE.JPEG];

interface ResolvedResume {
  applicationId: string;
  text: string;
}

/**
 * Scores how readable a resume is to an applicant tracking system, and saves
 * the result against it (one per resume, replaced on a re-check) so it is
 * still there after a reload. Unlike the match score it needs no job
 * description and no AI key: the score is computed in code and is the same
 * every time for the same text.
 */
export class ComputeResumeAtsScoreUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ComputeResumeAtsScoreInput): Promise<AtsScoreView> {
    if (!input.documentDraftId === !input.documentId) {
      throw new ValidationError('Choose exactly one resume to score');
    }

    if (
      !(await this.deps.computeResumeAtsScoreRateLimiter.consume(`resume-ats:user:${input.userId}`))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const { applicationId, text } = await this.resolveResume(input);
    const saved = await this.deps.resumeAtsScoreRepository.upsert({
      id: this.deps.generateId(),
      applicationId,
      documentDraftId: input.documentDraftId ?? null,
      documentId: input.documentId ?? null,
      ...scoreResumeText(text),
      generatedAt: this.deps.now(),
      resumeTextHash: hashResumeText(text),
    });
    return { ...saved, isStale: false };
  }

  private async resolveResume(input: ComputeResumeAtsScoreInput): Promise<ResolvedResume> {
    if (input.documentDraftId) {
      const draft = await this.deps.documentDraftRepository.findById(input.documentDraftId);
      if (!draft || draft.type !== RESUME_DOCUMENT_TYPE) {
        throw new NotFoundError('Resume not found');
      }
      await this.assertOwnsApplication(draft.applicationId, input.userId);
      return { applicationId: draft.applicationId, text: draft.plainText };
    }

    const doc = await this.deps.documentRepository.findById(input.documentId as string);
    if (!doc || doc.documentType !== RESUME_DOCUMENT_TYPE) {
      throw new NotFoundError('Resume not found');
    }
    await this.assertOwnsApplication(doc.applicationId, input.userId);

    // A photo of a resume has no text for a parser to read, which is the
    // finding itself, so it is scored as such rather than refused.
    const text = IMAGE_MIME_TYPES.includes(doc.mimeType)
      ? ''
      : await loadDocumentText(this.deps, doc);
    return { applicationId: doc.applicationId, text };
  }

  private async assertOwnsApplication(applicationId: string, userId: string): Promise<void> {
    const app = await this.deps.applicationRepository.findById(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== userId) throw new ForbiddenError('Forbidden');
  }
}
