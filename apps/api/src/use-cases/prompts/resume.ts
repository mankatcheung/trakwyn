import { z } from 'zod';
import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import {
  fenceUserInstructions,
  USER_INSTRUCTIONS_RULE,
} from '#src/use-cases/shared/aiInstructions.js';

export interface ResumePromptInput {
  app: { company: string; role: string; location?: string | null; description?: string | null };
  /** The candidate's profile as `formatUserProfile` renders it: the only facts the model may use. */
  profileText: string;
  /** Notes for this application (never the briefing); may be empty. */
  applicationContext: string;
  /** Notes and letters from other applications, only when the user opted in; may be empty. */
  crossApplicationContext: string;
  customAiPrompt: string | null | undefined;
  /** The user's own steer for this resume (JEF-506), already trimmed; `null` for none. */
  instructions?: string | null;
}

const SYSTEM_PROMPT = `You are a resume writer. You will be given a candidate's real work experience, education and skills, and a job they are applying for.

Your job is to SELECT, ORDER and REWORD what you are given so it reads well for this specific role. You are tailoring, not authoring.

Absolute rules:
- Never invent an employer, job title, institution, qualification, date, skill or achievement. Every company and institution you name must be one that appears in the candidate's background below.
- Never inflate seniority or exaggerate scope. If the background is thin, produce a short resume.
- Prefer the candidate's own wording where it is already clear.
- Write bullets as concrete accomplishments drawn from the descriptions provided. If a role has no description, write no bullets for it rather than imagining them.
- The candidate's name and contact details are added above your resume separately. Do not write a name, email address, phone number or other contact line anywhere in your reply.
${USER_INSTRUCTIONS_RULE}

Return ONLY minified JSON of this shape, with no markdown fence and no commentary:
{"summary":string,"experience":[{"company":string,"title":string,"period":string,"bullets":[string]}],"education":[{"institution":string,"qualification":string,"period":string}],"skills":[{"category":string,"items":[string]}]}`;

function userPrompt({
  app,
  profileText,
  applicationContext,
  crossApplicationContext,
  instructions,
}: ResumePromptInput): string {
  return [
    'Tailor this candidate to the following role.',
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    ...(app.location ? [`Location: ${app.location}`] : []),
    ...(app.description
      ? [
          `\nJob description:\n${wrapUntrustedContent(
            app.description.slice(0, AI_PROMPT_INPUT.COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS),
          )}`,
        ]
      : []),
    ...(applicationContext ? [`\n${applicationContext}`] : []),
    ...(crossApplicationContext ? [`\n${crossApplicationContext}`] : []),
    `\nCandidate background — the only facts you may use:\n${profileText}`,
    ...(instructions ? [`\nThe user's instructions:\n${fenceUserInstructions(instructions)}`] : []),
  ].join('\n');
}

export const resumePrompt: PromptDefinition<ResumePromptInput> = {
  id: AI_FEATURE.RESUME,
  version: 3,
  build: (input) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt: input.customAiPrompt,
      user: userPrompt(input),
    }),
};

/** The reply `resumePrompt` asks for. */
export const resumeResponseSchema = z.object({
  summary: z.string().optional(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      period: z.string().optional(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      qualification: z.string().optional(),
      period: z.string().optional(),
    }),
  ),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
});
