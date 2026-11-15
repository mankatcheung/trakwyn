import { z } from 'zod';
import { AI_FEATURE, CV_IMPORT, CV_IMPORT_PROMPT_TASK } from '#src/use-cases/constants.js';
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
const SYSTEM_PROMPT = `You are a CV parser. Your task is to ${CV_IMPORT_PROMPT_TASK} and ${RETURN_ONLY_VALID_JSON}. Copy what the CV says; never invent employers, schools, dates, skills, phone numbers or links. If a field cannot be determined, use null.`;

const userPrompt = ({
  cvText,
}: ParseCvPromptInput) => `Extract the following from this CV and return ONLY valid JSON:
{
  "contact": {
    "phone": "the candidate's phone number exactly as written, or null",
    "location": "the candidate's own city and country as written in the header, or null",
    "links": ["up to 3 full https URLs of the candidate's LinkedIn, portfolio or GitHub, only if written in the CV"]
  },
  "workExperiences": [
    {
      "company": "employer name",
      "title": "job title",
      "location": "city, country or remote, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, or \\"Present\\" when the role is still held",
      "description": "the role's responsibilities and achievements as the CV words them, every bullet kept with its numbers, one per line separated by \\n, at most ${CV_IMPORT.PROMPT_DESCRIPTION_MAX_CHARS} characters; do not summarise or reword; null when the CV gives none"
    }
  ],
  "educations": [
    {
      "institution": "school or university",
      "degree": "degree or qualification, or null",
      "field": "field of study, or null",
      "startDate": "YYYY-MM, or YYYY when only the year is given",
      "endDate": "YYYY-MM, YYYY, \\"Present\\", or null",
      "description": "honours, grade, thesis and relevant coursework as the CV words them, one per line separated by \\n, or null"
    }
  ],
  "skills": [
    { "name": "skill name", "category": "e.g. Language, Framework, Tool, Soft skill, or null", "proficiency": "beginner, intermediate, advanced or expert, only if the CV states a level; otherwise null" }
  ],
  "certifications": [
    { "name": "certification name as written", "issuer": "issuing body, or null", "issuedAt": "YYYY-MM or YYYY, or null", "expiresAt": "YYYY-MM or YYYY, or null", "credentialUrl": "a full https URL only if written in the CV, or null" }
  ],
  "languages": [
    { "name": "spoken language", "proficiency": "the level as the CV words it (for example Native, Fluent, B2), or null" }
  ],
  "projects": [
    { "name": "project name", "role": "the candidate's role, or null", "url": "a full https URL only if written in the CV, or null", "startDate": "YYYY-MM or YYYY, or null", "endDate": "YYYY-MM, YYYY, \\"Present\\", or null", "description": "what it was and what came of it, as the CV words it, at most ${CV_IMPORT.PROMPT_SECTION_DESCRIPTION_MAX_CHARS} characters, or null" }
  ],
  "awards": [
    { "title": "award or honour as written", "issuer": "who gave it, or null", "date": "YYYY-MM or YYYY, or null", "description": "one line as the CV words it, at most ${CV_IMPORT.PROMPT_SECTION_DESCRIPTION_MAX_CHARS} characters, or null" }
  ]
}

List work experience and education from most recent to oldest. When the CV lists more than ${CV_IMPORT.PROMPT_FULL_DETAIL_ROLES} roles, keep only the two strongest bullets for each role after the first ${CV_IMPORT.PROMPT_FULL_DETAIL_ROLES}. Leave out a work experience or education entry whose start date the CV does not give. Certifications, languages, projects and awards need no dates; use empty lists for any section the CV does not have, and never add one the CV does not state.

CV:
${wrapUntrustedContent(cvText)}`;

export const parseCvPrompt: PromptDefinition<ParseCvPromptInput> = {
  id: AI_FEATURE.PARSE_CV,
  version: 4,
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
  contact: z
    .object({
      phone: textField,
      location: textField,
      links: z.array(z.string()).nullable().optional(),
    })
    .nullable()
    .optional(),
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
  certifications: z
    .array(
      z.object({
        name: textField,
        issuer: textField,
        issuedAt: dateField,
        expiresAt: dateField,
        credentialUrl: textField,
      }),
    )
    .nullable()
    .optional(),
  languages: z
    .array(z.object({ name: textField, proficiency: textField }))
    .nullable()
    .optional(),
  projects: z
    .array(
      z.object({
        name: textField,
        role: textField,
        url: textField,
        startDate: dateField,
        endDate: dateField,
        description: textField,
      }),
    )
    .nullable()
    .optional(),
  awards: z
    .array(
      z.object({ title: textField, issuer: textField, date: dateField, description: textField }),
    )
    .nullable()
    .optional(),
});

export type ParsedCvReply = z.infer<typeof parsedCvResponseSchema>;
