import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface CompanyBriefingPromptInput {
  app: { company: string; role: string; location?: string | null; description?: string | null };
  customAiPrompt: string | null | undefined;
}

const SYSTEM_PROMPT = `You are a career research assistant preparing a candidate for a job application. Given a company, role, and job description, write a concise pre-interview briefing covering:

1. Company overview — what the company does, in a sentence or two.
2. Culture signals — what's likely true about how this company operates, based on its industry, size, and the tone of the job description.
3. Likely interview style — what kind of interview process a company like this typically runs (e.g. take-home vs. live coding, panel vs. 1:1, how many rounds).
4. Talking points — 3-5 specific things the candidate could bring up to show genuine interest and preparation.

Do NOT include a "recent news" section or reference specific current events, funding rounds, layoffs, leadership changes, or anything time-sensitive — you have no reliable access to real-time information, and presenting stale or fabricated "recent" facts as current would be actively misleading. If you don't have confident general knowledge of the company, say so plainly rather than guessing specifics.

Format the briefing as markdown: one "## " heading per section, bullet lists for the talking points and any other lists, and bold for key facts. Do not wrap the response in a code block.`;

function userPrompt({ app }: CompanyBriefingPromptInput): string {
  const lines = [
    `Prepare a briefing for this application:`,
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    ...(app.location ? [`Location: ${app.location}`] : []),
    ...(app.description
      ? [
          `\nJob description:\n${wrapUntrustedContent(app.description.slice(0, AI_PROMPT_INPUT.COMPANY_BRIEFING_JOB_DESCRIPTION_MAX_CHARS))}`,
        ]
      : []),
  ];

  return lines.join('\n');
}

export const companyBriefingPrompt: PromptDefinition<CompanyBriefingPromptInput> = {
  id: AI_FEATURE.COMPANY_BRIEFING,
  version: 1,
  build: (input) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt: input.customAiPrompt,
      user: userPrompt(input),
    }),
};
