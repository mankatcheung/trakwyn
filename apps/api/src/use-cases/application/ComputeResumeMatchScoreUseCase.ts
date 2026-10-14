import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { z } from 'zod';
import type { ResumeMatch } from '#src/domain/resumeMatch/ResumeMatch.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IResumeMatchRepository } from '#src/use-cases/ports/IResumeMatchRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { hashResumeText } from '#src/use-cases/shared/hashResumeText.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
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

const SYSTEM_PROMPT = `You are an ATS (applicant tracking system) resume screener. Compare a resume against a job description and return ONLY valid JSON with no markdown, no explanation, and no code fences.`;

const USER_PROMPT_TEMPLATE = (
  jobDescription: string,
  resumeText: string,
) => `Compare this resume against the job description below. Return ONLY valid JSON in this exact shape:
{
  "matchPercentage": <number 0-100>,
  "matchedKeywords": ["keyword1", "keyword2", ...],
  "missingKeywords": ["keyword1", "keyword2", ...],
  "summary": "2-3 sentence summary of the fit and the biggest gaps"
}

Job description:
${wrapUntrustedContent(jobDescription.slice(0, AI_PROMPT_INPUT.RESUME_MATCH_JOB_DESCRIPTION_MAX_CHARS))}

Resume:
${resumeText.slice(0, 6000)}`;

// matchPercentage is intentionally left unclamped here — parseResponse()
// clamps it to 0-100 after parsing. matchedKeywords/missingKeywords are
// validated as arrays so a malformed-but-truthy LLM response (e.g. a
// string) can't pass straight through as if it were valid.
const resumeMatchLlmResponseSchema = z.object({
  matchPercentage: z.number().optional(),
  matchedKeywords: z.array(z.string()).optional(),
  missingKeywords: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

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

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
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

    const result = await llmProvider.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(jobDescription, resumeText) },
      ],
      undefined,
      undefined,
      { json: true },
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
      resumeTextHash: hashResumeText(resumeText),
    });
    return { ...saved, isStale: false };
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
    const parsed = parseAiJson(raw, resumeMatchLlmResponseSchema);
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
