import {
  AiNotConfiguredError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type {
  IJobPostingSourceResolver,
  ResolvedJobPosting,
  StructuredJobPosting,
} from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import type { IParsedPostingCache } from '#src/use-cases/ports/IParsedPostingCache.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import {
  parseJobDescriptionPrompt,
  parsedJobDescriptionResponseSchema,
} from '#src/use-cases/prompts/parseJobDescription.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import {
  AI_FEATURE,
  AI_REASONING_DEFAULTS,
  FIELD_LENGTH_LIMITS,
  JOB_POSTING_STRUCTURED,
} from '#src/use-cases/constants.js';

export interface ParseJobDescriptionInput {
  userId: string;
  text?: string | null;
  url?: string | null;
}

export interface ParsedJobDescription {
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  /**
   * The posting as written (JEF-591), for `JobApplication.postingText`: the
   * page's own JSON-LD description when it has one, else the text that was
   * read. Cut to `FIELD_LENGTH_LIMITS.POSTING_TEXT`. Never from the model, so
   * it is added after the cache and the parse rather than stored in either.
   */
  postingText: string | null;
}

/** What the model, the JSON-LD and the cross-user cache hold: everything but the text itself. */
export type ParsedPostingFields = Omit<ParsedJobDescription, 'postingText'>;

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  jobPostingSourceResolver: IJobPostingSourceResolver;
  parsedPostingCache: IParsedPostingCache;
  parseJobDescriptionRateLimiter: IRateLimiter;
}

function isCompleteStructuredPosting(posting: StructuredJobPosting): boolean {
  return Boolean(
    posting.role &&
    posting.company &&
    (posting.description?.length ?? 0) >= JOB_POSTING_STRUCTURED.MIN_DESCRIPTION_CHARS,
  );
}

export class ParseJobDescriptionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ParseJobDescriptionInput): Promise<ParsedJobDescription> {
    if (
      !(await this.deps.parseJobDescriptionRateLimiter.consume(
        `parse-job-description:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.PARSE_JOB_DESCRIPTION,
      promptVersion: parseJobDescriptionPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const posting = await this.deps.jobPostingSourceResolver.resolveDetailed({
      text: input.text,
      url: input.url,
    });
    const text = posting.text;
    if (!text.trim()) {
      throw new ValidationError('No job description content provided');
    }

    const postingText =
      (posting.structuredDescription ?? text)
        .trim()
        .slice(0, FIELD_LENGTH_LIMITS.POSTING_TEXT)
        .trim() || null;
    return { ...(await this.parseFields(llmProvider, posting)), postingText };
  }

  private async parseFields(
    llmProvider: ILLMProvider,
    posting: ResolvedJobPosting,
  ): Promise<ParsedPostingFields> {
    // A page that carries complete JSON-LD needs no model at all.
    if (posting.structured && isCompleteStructuredPosting(posting.structured)) {
      return { ...posting.structured };
    }

    const parse = () => this.askModel(llmProvider, posting.text, posting.structured);
    // Only a page the server fetched from a public URL is shared between
    // users; pasted text may hold the user's own notes.
    if (!posting.fetchedFromUrl) return parse();
    return (await this.deps.parsedPostingCache.getOrParse(posting.text, parse)).value;
  }

  private async askModel(
    llmProvider: ILLMProvider,
    text: string,
    hints: StructuredJobPosting | null,
  ): Promise<ParsedPostingFields> {
    const result = await llmProvider.complete(
      parseJobDescriptionPrompt.build({ text, hints }),
      undefined,
      undefined,
      { json: true, reasoning: AI_REASONING_DEFAULTS.JOB_DESCRIPTION },
    );
    assertNotTruncated(result);

    return this.parseResponse(result.content);
  }

  private parseResponse(raw: string): ParsedPostingFields {
    const parsed = parseAiJson(raw, parsedJobDescriptionResponseSchema);
    return {
      company: parsed.company ?? null,
      role: parsed.role ?? null,
      location: parsed.location ?? null,
      salary: parsed.salary ?? null,
      description: parsed.description ?? null,
    };
  }
}
