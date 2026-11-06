import { z } from 'zod';
import { AI_FEATURE, CV_IMPORT_PROMPT_TASK } from '#src/use-cases/constants.js';
import { RETURN_ONLY_VALID_JSON } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface ParseCvPromptInput {
  /** The CV's extracted text, already cut to `AI_PROMPT_INPUT.CV_IMPORT_MAX_CHARS`. */
  cvText: string;
}

// `CV_IMPORT_PROMPT_TASK` is what the fake LLM route looks for to answer this
// prompt with a canned profile (e2e needs no key), so it must stay in the
// system text.
const SYSTEM_PROMPT = `You are a CV parser. Your task is to ${CV_IMPORT_PROMPT_TASK} and ${RETURN_ONLY_VALID_JSON}. Copy what the CV says; never invent employers, schools, dates or skills. If a field cannot be determined, use null.`;

const userPrompt = ({
  cvText,
}: ParseCvPromptInput) => `Extract the following from this CV and return ONLY valid JSON:
{
  "workExperiences": [
    {
      "company": "employer name",
      "title": "job title",
      "location": "city, country or remote, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, or \\"Present\\" when the role is still held",
      "description": "one sentence of at most 200 characters on the responsibilities and achievements, or null"
    }
  ],
  "educations": [
    {
      "institution": "school or university",
      "degree": "degree or qualification, or null",
      "field": "field of study, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, \\"Present\\", or null",
      "description": "honours or thesis in at most 100 characters, or null"
    }
  ],
  "skills": [
    { "name": "skill name", "category": "e.g. Language, Framework, Tool, Soft skill, or null", "proficiency": "beginner, intermediate, advanced or expert, only if the CV states a level; otherwise null" }
  ]
}

List work experience and education from most recent to oldest. Leave out an entry whose start date the CV does not give.

CV:
${wrapUntrustedContent(cvText)}`;

export const parseCvPrompt: PromptDefinition<ParseCvPromptInput> = {
  id: AI_FEATURE.PARSE_CV,
  version: 1,
  build: (input) => [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt(input) },
  ],
};

// A model may send null, omit a key, or give a year as a number; the
// normalisers decide what is usable. A field of the wrong kind (an object, a
// section that is a string) fails the whole reply rather than slipping through.
const textField = z.string().nullable().optional();
const dateField = z.union([z.string(), z.number()]).nullable().optional();

/** The reply `parseCvPrompt` asks for. */
export const parsedCvResponseSchema = z.object({
  workExperiences: z
    .array(
      z.object({
        company: textField,
        title: textField,
        location: textField,
        startDate: dateField,
        endDate: dateField,
        description: textField,
      }),
    )
    .nullable()
    .optional(),
  educations: z
    .array(
      z.object({
        institution: textField,
        degree: textField,
        field: textField,
        startDate: dateField,
        endDate: dateField,
        description: textField,
      }),
    )
    .nullable()
    .optional(),
  skills: z
    .array(z.object({ name: textField, category: textField, proficiency: textField }))
    .nullable()
    .optional(),
});

export type ParsedCvReply = z.infer<typeof parsedCvResponseSchema>;
