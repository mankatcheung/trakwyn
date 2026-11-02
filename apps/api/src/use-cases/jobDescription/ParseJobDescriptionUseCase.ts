import {
  AiNotConfiguredError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { z } from 'zod';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type {
  IJobPostingSourceResolver,
  StructuredJobPosting,
} from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import type { IParsedPostingCache } from '#src/use-cases/ports/IParsedPostingCache.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import {
  AI_PROMPT_INPUT,
  AI_FEATURE,
  AI_REASONING_DEFAULTS,
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
}

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  jobPostingSourceResolver: IJobPostingSourceResolver;
  parsedPostingCache: IParsedPostingCache;
  parseJobDescriptionRateLimiter: IRateLimiter;
}

const SYSTEM_PROMPT = `You are a job posting parser. Extract structured data from job postings and return ONLY valid JSON with no markdown, no explanation, and no code fences. If a field cannot be determined, use null.`;

const USER_PROMPT_TEMPLATE = (
  text: string,
  hints: StructuredJobPosting | null,
) => `Extract the following from this job posting and return ONLY valid JSON:
{
  "company": "company name or null",
  "role": "job title or null",
  "location": "location (city, remote, hybrid, etc.) or null",
  "salary": "salary range or null",
  "description": "2-3 sentence summary of the role and key requirements, or null"
}

Job posting:
${wrapUntrustedContent(text.slice(0, AI_PROMPT_INPUT.JOB_POSTING_MAX_CHARS))}${hintsSection(hints)}`;

/** Fields the page's own JSON-LD already gave us, so the model only fills the gaps (JEF-450). */
function hintsSection(hints: StructuredJobPosting | null): string {
  if (!hints) return '';
  const known = Object.fromEntries(
    Object.entries(hints).filter(([key, value]) => value && key !== 'description'),
  );
  if (Object.keys(known).length === 0) return '';
  return `

Fields the page already states (use them unless the posting contradicts them):
${wrapUntrustedContent(JSON.stringify(known))}`;
}

// A field the model omits, or explicitly sends as null, both mean the same
// thing here ("couldn't determine this") — parseResponse() normalizes both
// to null below. A field present with the wrong type (e.g. a number where a
// string is expected) fails validation instead of silently passing through.
const nullableStringField = z.string().nullable().optional();

const parsedJobDescriptionSchema = z.object({
  company: nullableStringField,
  role: nullableStringField,
  location: nullableStringField,
  salary: nullableStringField,
  description: nullableStringField,
});

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

    // A page that carries complete JSON-LD needs no model at all.
    if (posting.structured && isCompleteStructuredPosting(posting.structured)) {
      return { ...posting.structured };
    }

    const parse = () => this.askModel(llmProvider, text, posting.structured);
    // Only a page the server fetched from a public URL is shared between
    // users; pasted text may hold the user's own notes.
    if (!posting.fetchedFromUrl) return parse();
    return (await this.deps.parsedPostingCache.getOrParse(text, parse)).value;
  }

  private async askModel(
    llmProvider: ILLMProvider,
    text: string,
    hints: StructuredJobPosting | null,
  ): Promise<ParsedJobDescription> {
    const result = await llmProvider.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(text, hints) },
      ],
      undefined,
      undefined,
      { json: true, reasoning: AI_REASONING_DEFAULTS.JOB_DESCRIPTION },
    );
    assertNotTruncated(result);

    return this.parseResponse(result.content);
  }

  private parseResponse(raw: string): ParsedJobDescription {
    const parsed = parseAiJson(raw, parsedJobDescriptionSchema);
    return {
      company: parsed.company ?? null,
      role: parsed.role ?? null,
      location: parsed.location ?? null,
      salary: parsed.salary ?? null,
      description: parsed.description ?? null,
    };
  }
}
