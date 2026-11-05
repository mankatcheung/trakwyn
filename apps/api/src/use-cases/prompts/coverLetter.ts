import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface CoverLetterPromptInput {
  app: { company: string; role: string; location?: string | null; description?: string | null };
  /** The user's profile as `formatUserProfile` renders it; may be empty. */
  profile: string;
  resumeText: string | null | undefined;
  /** Notes and briefing for this application; may be empty. */
  applicationContext: string;
  /** Notes and letters from other applications, only when the user opted in; may be empty. */
  crossApplicationContext: string;
  customAiPrompt: string | null | undefined;
}

const SYSTEM_PROMPT = `You are a professional cover letter writer. Write compelling, personalized cover letters that are concise (3-4 paragraphs), specific to the role, and written in first person. Return ONLY the cover letter body — no subject line, no date, no address block, no explanation.`;

function userPrompt(input: CoverLetterPromptInput): string {
  const { app, profile, resumeText, applicationContext, crossApplicationContext } = input;
  const lines = [
    `Write a cover letter for this job application:`,
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    ...(app.location ? [`Location: ${app.location}`] : []),
    ...(app.description
      ? [
          `\nJob description:\n${wrapUntrustedContent(app.description.slice(0, AI_PROMPT_INPUT.COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS))}`,
        ]
      : []),
  ];

  if (applicationContext) {
    lines.push(`\n${applicationContext}`);
  }

  if (crossApplicationContext) {
    lines.push(`\n${crossApplicationContext}`);
  }

  // The profile is what the user maintains in Settings, so it is always the
  // base. A selected resume adds to it rather than standing in for it
  // (JEF-396); only with neither is the letter written generically.
  const hasResume = Boolean(resumeText?.trim());
  if (profile) {
    lines.push(
      `\nMy background (work experience, education and skills):\n${profile.slice(0, 4000)}`,
    );
  }
  if (hasResume) {
    lines.push(`\nMy resume:\n${resumeText!.trim().slice(0, 4000)}`);
  }
  if (!profile && !hasResume) {
    lines.push('\nWrite a strong general cover letter for someone applying to this role.');
  }

  return lines.join('\n');
}

export const coverLetterPrompt: PromptDefinition<CoverLetterPromptInput> = {
  id: AI_FEATURE.COVER_LETTER,
  version: 1,
  build: (input) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt: input.customAiPrompt,
      user: userPrompt(input),
    }),
};
