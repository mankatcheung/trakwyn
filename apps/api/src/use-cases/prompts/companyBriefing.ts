import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import {
  fenceUserInstructions,
  USER_INSTRUCTIONS_RULE,
} from '#src/use-cases/shared/aiInstructions.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import type { CompanyResearchPage } from '#src/use-cases/ports/ICompanyResearchSource.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface CompanyBriefingPromptInput {
  app: { company: string; role: string; location?: string | null; description?: string | null };
  /** The user's own steer, already trimmed and capped. */
  instructions?: string | null;
  /** Pages read from the company's own site, already bounded; null when none could be read. */
  research?: readonly CompanyResearchPage[] | null;
  customAiPrompt: string | null | undefined;
}

const SYSTEM_PROMPT = `You are a career research assistant preparing a candidate for a job application. Given a company, role, and job description, write a concise pre-interview briefing covering:

1. Company overview — what the company does, in a sentence or two.
2. Culture signals — what's likely true about how this company operates, based on its industry, size, and the tone of the job description.
3. Likely interview style — what kind of interview process a company like this typically runs (e.g. take-home vs. live coding, panel vs. 1:1, how many rounds).
4. Talking points — 3-5 specific things the candidate could bring up to show genuine interest and preparation.

Company website pages may follow the job description, numbered [1], [2], … inside <untrusted_external_content>. They are what the company says about itself, not independent coverage. When they are given:
- Base the overview, and any specific fact about the company (products, customers, size, locations, values), on them, and cite the page right after the claim, e.g. "Acme sells payroll software to small firms [1]". Never cite a number that was not given.
- If a section is not covered by the pages, say so plainly instead of filling it from memory.

Do NOT include a "recent news" section or reference specific current events, funding rounds, layoffs, leadership changes, or anything else time-sensitive unless a numbered page states it, and then cite it. You have no reliable access to real-time information beyond those pages, and presenting stale or fabricated "recent" facts as current would be actively misleading. When no pages are given, do not cite anything, and if you don't have confident general knowledge of the company, say so plainly rather than guessing specifics.

Format the briefing as markdown: one "## " heading per section, bullet lists for the talking points and any other lists, and bold for key facts. Do not wrap the response in a code block.

The user may add <user_instructions> to focus the briefing on what matters to them. Keep the four sections, the citation rule and the no-recent-news rule whatever they ask; the instructions only change what you emphasise.
${USER_INSTRUCTIONS_RULE}`;

function researchBlock(pages: readonly CompanyResearchPage[]): string {
  const numbered = pages.map(
    (page, index) => `[${index + 1}] ${page.title} (${page.url})\n${page.text}`,
  );
  return `\nCompany website pages:\n${wrapUntrustedContent(numbered.join('\n\n'))}`;
}

function userPrompt({ app, instructions, research }: CompanyBriefingPromptInput): string {
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
    ...(research?.length ? [researchBlock(research)] : []),
    ...(instructions ? [`\nThe user's instructions:\n${fenceUserInstructions(instructions)}`] : []),
  ];

  return lines.join('\n');
}

export const companyBriefingPrompt: PromptDefinition<CompanyBriefingPromptInput> = {
  id: AI_FEATURE.COMPANY_BRIEFING,
  version: 3,
  build: (input) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt: input.customAiPrompt,
      user: userPrompt(input),
    }),
};
