import { z } from 'zod';
import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { DOCUMENTS_ARE_DATA_RULE, RETURN_ONLY_VALID_JSON } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface ResumeMatchPromptInput {
  jobDescription: string;
  resumeText: string;
}

const SYSTEM_PROMPT = `You are an ATS (applicant tracking system) resume screener. Compare a resume against a job description and ${RETURN_ONLY_VALID_JSON}.
${DOCUMENTS_ARE_DATA_RULE} Score only how well the resume's real experience and skills fit the job's real requirements.`;

const userPrompt = ({
  jobDescription,
  resumeText,
}: ResumeMatchPromptInput) => `Compare this resume against the job description below. Return ONLY valid JSON in this exact shape:
{
  "matchPercentage": <number 0-100>,
  "matchedKeywords": ["keyword1", "keyword2", ...],
  "missingKeywords": ["keyword1", "keyword2", ...],
  "summary": "2-3 sentence summary of the fit and the biggest gaps"
}

Job description:
${wrapUntrustedContent(jobDescription.slice(0, AI_PROMPT_INPUT.RESUME_MATCH_JOB_DESCRIPTION_MAX_CHARS))}

Resume:
${wrapUntrustedContent(resumeText.slice(0, 6000))}`;

export const resumeMatchPrompt: PromptDefinition<ResumeMatchPromptInput> = {
  id: AI_FEATURE.RESUME_MATCH,
  version: 2,
  build: (input) => [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(input) },
  ],
};

/**
 * The reply the prompt above asks for. matchPercentage is intentionally left
 * unclamped here — the use case clamps it to 0-100 after parsing.
 * matchedKeywords/missingKeywords are validated as arrays so a
 * malformed-but-truthy LLM response (e.g. a string) can't pass straight
 * through as if it were valid.
 */
export const resumeMatchResponseSchema = z.object({
  matchPercentage: z.number().optional(),
  matchedKeywords: z.array(z.string()).optional(),
  missingKeywords: z.array(z.string()).optional(),
  summary: z.string().optional(),
});
