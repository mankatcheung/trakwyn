import { z } from 'zod';
import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import type { StructuredJobPosting } from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import { RETURN_ONLY_VALID_JSON } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface ParseJobDescriptionPromptInput {
  text: string;
  /** Fields the page's own JSON-LD already stated, if any. */
  hints: StructuredJobPosting | null;
}

const SYSTEM_PROMPT = `You are a job posting parser. Extract structured data from job postings and ${RETURN_ONLY_VALID_JSON}. If a field cannot be determined, use null.`;

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

const userPrompt = ({
  text,
  hints,
}: ParseJobDescriptionPromptInput) => `Extract the following from this job posting and return ONLY valid JSON:
{
  "company": "company name or null",
  "role": "job title or null",
  "location": "location (city, remote, hybrid, etc.) or null",
  "salary": "salary range or null",
  "description": "2-3 sentence summary of the role and key requirements, or null"
}

Job posting:
${wrapUntrustedContent(text.slice(0, AI_PROMPT_INPUT.JOB_POSTING_MAX_CHARS))}${hintsSection(hints)}`;

/**
 * Bump `PARSED_POSTING_CACHE.VERSION` along with this version when the
 * wording or output shape changes: parsed postings are cached across users
 * for a week, keyed on the page text and that version.
 */
export const parseJobDescriptionPrompt: PromptDefinition<ParseJobDescriptionPromptInput> = {
  id: AI_FEATURE.PARSE_JOB_DESCRIPTION,
  version: 1,
  build: (input) => [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(input) },
  ],
};

// A field the model omits, or explicitly sends as null, both mean the same
// thing here ("couldn't determine this") — the use case normalizes both to
// null. A field present with the wrong type (e.g. a number where a string is
// expected) fails validation instead of silently passing through.
const nullableStringField = z.string().nullable().optional();

/** The reply `parseJobDescriptionPrompt` asks for. */
export const parsedJobDescriptionResponseSchema = z.object({
  company: nullableStringField,
  role: nullableStringField,
  location: nullableStringField,
  salary: nullableStringField,
  description: nullableStringField,
});
