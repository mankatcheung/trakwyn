import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { PostingRequirements } from '#src/domain/postingRequirements/PostingRequirements.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IPostingRequirementsRepository } from '#src/use-cases/ports/IPostingRequirementsRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import {
  postingRequirementsPrompt,
  postingRequirementsResponseSchema,
} from '#src/use-cases/prompts/postingRequirements.js';
import { hashJobDescription } from '#src/use-cases/shared/hashJobDescription.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { postingForPrompt } from '#src/use-cases/shared/postingForPrompt.js';
import {
  AI_FEATURE,
  AI_PROMPT_INPUT,
  AI_REASONING_DEFAULTS,
  POSTING_REQUIREMENTS,
} from '#src/use-cases/constants.js';
import {
  isCurrent,
  type PostingRequirementsView,
} from '#src/use-cases/postingRequirements/postingRequirementsView.js';

export interface ExtractPostingRequirementsInput {
  userId: string;
  applicationId: string;
}

export interface IExtractPostingRequirementsUseCase {
  execute(input: ExtractPostingRequirementsInput): Promise<PostingRequirementsView>;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  postingRequirementsRepository: IPostingRequirementsRepository;
  llmProviderFactory: ILLMProviderFactory;
  extractPostingRequirementsRateLimiter: IRateLimiter;
  generateId: () => string;
  now: () => Date;
}

/** Trimmed, cut to length, without blanks or repeats (case-insensitive), at most `max` of them. */
function cleanList(items: readonly string[] | null | undefined, max: number): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of items ?? []) {
    const text = item.replace(/\s+/g, ' ').trim().slice(0, POSTING_REQUIREMENTS.ITEM_MAX_CHARS);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length === max) break;
  }
  return cleaned;
}

/**
 * Reads what a posting asks for and keeps it with the application (JEF-593).
 *
 * One model call per version of the posting: the saved row is returned with no
 * call, no rate-limit attempt and nothing charged while the posting's hash and
 * the prompt version are unchanged, the same reuse the match score has
 * (JEF-450). That is what lets resume generation call this every time.
 *
 * The posting is the full text when it was captured, else the description
 * (`postingForPrompt`), and the hash is of the part that is sent.
 */
export class ExtractPostingRequirementsUseCase implements IExtractPostingRequirementsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ExtractPostingRequirementsInput): Promise<PostingRequirementsView> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const posting = postingForPrompt(app)?.slice(0, AI_PROMPT_INPUT.POSTING_REQUIREMENTS_MAX_CHARS);
    if (!posting) {
      throw new ValidationError(
        'Add the job posting to this application before reading its requirements',
      );
    }
    const postingHash = hashJobDescription(posting);

    const saved = await this.deps.postingRequirementsRepository.findByApplicationId(
      input.applicationId,
    );
    if (saved && isCurrent(saved, postingHash)) return { ...saved, isStale: false };

    if (
      !(await this.deps.extractPostingRequirementsRateLimiter.consume(
        `posting-requirements:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.POSTING_REQUIREMENTS,
      promptVersion: postingRequirementsPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const result = await llmProvider.complete(
      postingRequirementsPrompt.build({ company: app.company, role: app.role, posting }),
      POSTING_REQUIREMENTS.MAX_OUTPUT_TOKENS,
      undefined,
      { json: true, reasoning: AI_REASONING_DEFAULTS.POSTING_REQUIREMENTS },
    );
    assertNotTruncated(result);
    const reply = parseAiJson(result.content, postingRequirementsResponseSchema);

    // Only reached on success, so a failed call leaves the previous list in place.
    const requirements: PostingRequirements = {
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      mustHave: cleanList(reply.mustHave, POSTING_REQUIREMENTS.MAX_ITEMS),
      niceToHave: cleanList(reply.niceToHave, POSTING_REQUIREMENTS.MAX_ITEMS),
      keywords: cleanList(reply.keywords, POSTING_REQUIREMENTS.MAX_KEYWORDS),
      seniority: reply.seniority?.trim().slice(0, POSTING_REQUIREMENTS.SENIORITY_MAX_CHARS) || null,
      postingHash,
      promptVersion: postingRequirementsPrompt.version,
      generatedAt: this.deps.now(),
    };
    return {
      ...(await this.deps.postingRequirementsRepository.upsert(requirements)),
      isStale: false,
    };
  }
}
