import {
  AiNotConfiguredError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import { z } from 'zod';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IJobPostingSourceResolver } from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';

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
  parseJobDescriptionRateLimiter: IRateLimiter;
}

const SYSTEM_PROMPT = `You are a job posting parser. Extract structured data from job postings and return ONLY valid JSON with no markdown, no explanation, and no code fences. If a field cannot be determined, use null.`;

const USER_PROMPT_TEMPLATE = (
  text: string,
) => `Extract the following from this job posting and return ONLY valid JSON:
{
  "company": "company name or null",
  "role": "job title or null",
  "location": "location (city, remote, hybrid, etc.) or null",
  "salary": "salary range or null",
  "description": "2-3 sentence summary of the role and key requirements, or null"
}

Job posting:
${wrapUntrustedContent(text.slice(0, AI_PROMPT_INPUT.JOB_POSTING_MAX_CHARS))}`;

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

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const text = await this.deps.jobPostingSourceResolver.resolve({
      text: input.text,
      url: input.url,
    });
    if (!text.trim()) {
      throw new ValidationError('No job description content provided');
    }

    const result = await llmProvider.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(text) },
      ],
      undefined,
      undefined,
      { json: true },
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
