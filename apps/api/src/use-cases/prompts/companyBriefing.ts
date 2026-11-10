import { AI_FEATURE, AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import {
  fenceUserInstructions,
  USER_INSTRUCTIONS_RULE,
} from '#src/use-cases/shared/aiInstructions.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import type { CompanyResearchPage } from '#src/use-cases/ports/ICompanyResearchSource.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

/**
 * A numbered source. `kind` says who is speaking: the company's own site (the
 * default, so a caller that only reads sites need not say) or a web search
 * result about it (JEF-538), which also carries the date it was published.
 */
export type BriefingResearchPage = CompanyResearchPage & { kind?: 'site' | 'search' };

export interface CompanyBriefingPromptInput {
  app: { company: string; role: string; location?: string | null; description?: string | null };
  /** The user's own steer, already trimmed and capped. */
  instructions?: string | null;
  /** Numbered in this order. Already bounded; null when nothing could be read. */
  research?: readonly BriefingResearchPage[] | null;
  customAiPrompt: string | null | undefined;
}

const SYSTEM_PROMPT = `You are a career research assistant preparing a candidate for a job application. Given a company, role, and job description, write a concise pre-interview briefing covering:

1. Company overview — what the company does, in a sentence or two.
2. Culture signals — what's likely true about how this company operates, based on its industry, size, and the tone of the job description.
3. Likely interview style — what kind of interview process a company like this typically runs (e.g. take-home vs. live coding, panel vs. 1:1, how many rounds).
4. Talking points — 3-5 specific things the candidate could bring up to show genuine interest and preparation.

Numbered sources may follow the job description, [1], [2], … inside <untrusted_external_content>. They are of two kinds:
- Company website pages: what the company says about itself, not independent coverage.
- Web search results, with the date each was published when it is known: what others say about the company, such as news, funding and reviews. They come from a search by company name, so one may be about a different company with a similar name. Ignore any that does not fit this company, role and location.

When sources are given:
- Base the overview, and any specific fact about the company (products, customers, size, locations, values), on them, and cite the source right after the claim, e.g. "Acme sells payroll software to small firms [1]". Never cite a number that was not given.
- State a claim from a search result with its date, e.g. "raised a Series B, reported March 2026 [3]", or say the report is undated when no date is given. Report what reviews say as opinion ("reviewers describe a flat team [4]"), never as established fact.
- When a search result about this company reports notable news (funding, expansion, an acquisition), mention it briefly in the company overview with its date and citation, e.g. "raised a £12m Series B, reported March 2026 [3]". Do not skip it because other sources cover the same topic.
- If a section is not covered by the sources, say so plainly instead of filling it from memory.

Do NOT include a "recent news" section or reference specific current events, funding rounds, layoffs, leadership changes, or anything else time-sensitive unless a numbered source states it, and then cite it (with its date for a search result). You have no reliable access to real-time information beyond those sources, and presenting stale or fabricated "recent" facts as current would be actively misleading. When no sources are given, do not cite anything, and if you don't have confident general knowledge of the company, say so plainly rather than guessing specifics.

Format the briefing as markdown: one "## " heading per section, bullet lists for the talking points and any other lists, and bold for key facts. Do not wrap the response in a code block.

The user may add <user_instructions> to focus the briefing on what matters to them. Keep the four sections, the citation rule and the no-recent-news rule whatever they ask; the instructions only change what you emphasise.
${USER_INSTRUCTIONS_RULE}`;

function publishedNote(page: BriefingResearchPage): string {
  if (page.kind !== 'search') return '';
  const published = page.publishedAt ? new Date(page.publishedAt) : null;
  return published && !Number.isNaN(published.getTime())
    ? ` — published ${published.toISOString().slice(0, 10)}`
    : ' — date unknown';
}

function researchBlock(pages: readonly BriefingResearchPage[]): string {
  // Numbered across both kinds, in the order given, so a citation means the
  // same source here and in the saved list.
  const numbered = pages.map((page, index) => ({
    kind: page.kind ?? 'site',
    entry: `[${index + 1}] ${page.title} (${page.url})${publishedNote(page)}\n${page.text}`,
  }));
  const group = (kind: 'site' | 'search', heading: string): string[] => {
    const entries = numbered.filter((n) => n.kind === kind).map((n) => n.entry);
    return entries.length > 0
      ? [`\n${heading}:\n${wrapUntrustedContent(entries.join('\n\n'))}`]
      : [];
  };
  return [...group('site', 'Company website pages'), ...group('search', 'Web search results')].join(
    '\n',
  );
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
  version: 5,
  build: (input) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt: input.customAiPrompt,
      user: userPrompt(input),
    }),
};
