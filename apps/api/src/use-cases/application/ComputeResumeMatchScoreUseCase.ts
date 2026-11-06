import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ResumeMatch } from '#src/domain/resumeMatch/ResumeMatch.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IResumeMatchRepository } from '#src/use-cases/ports/IResumeMatchRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import {
  resumeMatchPrompt,
  resumeMatchResponseSchema,
} from '#src/use-cases/prompts/resumeMatch.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import { hashJobDescription } from '#src/use-cases/shared/hashJobDescription.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { AI_FEATURE, AI_REASONING_DEFAULTS } from '#src/use-cases/constants.js';
import { loadDocumentText } from '#src/use-cases/shared/loadDocumentText.js';

export interface ComputeResumeMatchScoreInput {
  applicationId: string;
  userId: string;
  /** The resume to score: a draft or an uploaded file, exactly one. */
  documentDraftId?: string | null;
  documentId?: string | null;
}

/** A saved match plus whether the resume has changed since it was scored. */
export interface ResumeMatchView extends ResumeMatch {
  isStale: boolean;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  documentDraftRepository: IDocumentDraftRepository;
  resumeMatchRepository: IResumeMatchRepository;
  storageProvider: IStorageProvider;
  documentTextExtractor: IDocumentTextExtractor;
  llmProviderFactory: ILLMProviderFactory;
  computeResumeMatchScoreRateLimiter: IRateLimiter;
  generateId: () => string;
  now: () => Date;
}

const RESUME_DOCUMENT_TYPE = 'resume';

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent match';
  if (score >= 70) return 'Good match';
  if (score >= 40) return 'Some overlap';
  return 'Needs work';
}

export class ComputeResumeMatchScoreUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ComputeResumeMatchScoreInput): Promise<ResumeMatchView> {
    if (!input.documentDraftId === !input.documentId) {
      throw new ValidationError('Choose exactly one resume to match');
    }

    if (
      !(await this.deps.computeResumeMatchScoreRateLimiter.consume(
        `resume-match:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.RESUME_MATCH,
      promptVersion: resumeMatchPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const jobDescription = app.description?.trim();
    if (!jobDescription) {
      throw new ValidationError(
        'Add a job description to this application before checking resume match',
      );
    }

    const resumeText = await this.resolveResumeText(input);
    const resumeTextHash = hashResumeText(resumeText);
    const jobDescriptionHash = hashJobDescription(jobDescription);

    // Nothing changed since the last score: that answer is still right, so
    // no model call and nothing to charge (JEF-450).
    const previous = await this.findPreviousMatch(input);
    if (
      previous &&
      previous.resumeTextHash === resumeTextHash &&
      previous.jobDescriptionHash === jobDescriptionHash
    ) {
      return { ...previous, isStale: false };
    }

    const result = await llmProvider.complete(
      resumeMatchPrompt.build({ jobDescription, resumeText }),
      undefined,
      undefined,
      { json: true, reasoning: AI_REASONING_DEFAULTS.RESUME_MATCH },
    );
    assertNotTruncated(result);

    // Only reached on success, so a failed call leaves the previous match
    // intact rather than blanking it.
    const saved = await this.deps.resumeMatchRepository.upsert({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      documentDraftId: input.documentDraftId ?? null,
      documentId: input.documentId ?? null,
      ...this.parseResponse(result.content),
      generatedAt: this.deps.now(),
      resumeTextHash,
      jobDescriptionHash,
    });
    return { ...saved, isStale: false };
  }

  private async findPreviousMatch(
    input: ComputeResumeMatchScoreInput,
  ): Promise<ResumeMatch | null> {
    const matches = await this.deps.resumeMatchRepository.findByApplicationId(input.applicationId);
    return (
      matches.find((match) =>
        input.documentDraftId
          ? match.documentDraftId === input.documentDraftId
          : match.documentId === input.documentId,
      ) ?? null
    );
  }

  private async resolveResumeText(input: ComputeResumeMatchScoreInput): Promise<string> {
    if (input.documentDraftId) {
      const draft = await this.deps.documentDraftRepository.findById(input.documentDraftId);
      if (!draft || draft.applicationId !== input.applicationId || draft.type !== 'resume') {
        throw new NotFoundError('Resume not found');
      }
      if (!draft.plainText.trim()) {
        throw new ValidationError('This resume is empty — add some content before matching');
      }
      return draft.plainText;
    }

    const doc = await this.deps.documentRepository.findById(input.documentId as string);
    if (
      !doc ||
      doc.applicationId !== input.applicationId ||
      doc.documentType !== RESUME_DOCUMENT_TYPE
    ) {
      throw new NotFoundError('Resume not found');
    }

    const text = await loadDocumentText(this.deps, doc);

    if (!text.trim()) {
      throw new ValidationError('No text could be read from this resume');
    }
    return text;
  }

  private parseResponse(
    raw: string,
  ): Pick<ResumeMatch, 'score' | 'label' | 'matchedKeywords' | 'missingKeywords' | 'summary'> {
    const parsed = parseAiJson(raw, resumeMatchResponseSchema);
    const score = Math.max(0, Math.min(100, Math.round(parsed.matchPercentage ?? 0)));
    return {
      score,
      label: scoreLabel(score),
      matchedKeywords: parsed.matchedKeywords ?? [],
      missingKeywords: parsed.missingKeywords ?? [],
      summary: parsed.summary ?? '',
    };
  }
}
