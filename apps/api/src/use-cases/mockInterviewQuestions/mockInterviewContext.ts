import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';
import type { InterviewRound } from '#src/domain/interviewRound/InterviewRound.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

interface ApplicationFacts {
  company: string;
  role: string;
  location?: string | null;
  description?: string | null;
}

export interface MockInterviewContext {
  /** The prompt block handed to the model. */
  text: string;
  /** What the model actually had to work from, so the UI can say when it was thin. */
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

/**
 * Builds what the model knows about the interview: the role, the round, the job
 * description and the company briefing. The last two are user- or model-written
 * text, so they are capped and fenced as untrusted data.
 */
export function buildMockInterviewContext(
  app: ApplicationFacts,
  round: Pick<InterviewRound, 'type'>,
  briefing: Pick<CompanyBriefing, 'content'> | null,
): MockInterviewContext {
  const description = app.description?.trim();
  const briefingContent = briefing?.content.trim();

  const lines = [
    `Company: ${app.company}`,
    `Role: ${app.role}`,
    ...(app.location ? [`Location: ${app.location}`] : []),
    `Interview round: ${round.type}`,
    ...(description
      ? [
          `\nJob description:\n${wrapUntrustedContent(description.slice(0, AI_PROMPT_INPUT.MOCK_INTERVIEW_JOB_DESCRIPTION_MAX_CHARS))}`,
        ]
      : []),
    ...(briefingContent
      ? [
          `\nCompany briefing:\n${wrapUntrustedContent(briefingContent.slice(0, AI_PROMPT_INPUT.MOCK_INTERVIEW_BRIEFING_MAX_CHARS))}`,
        ]
      : []),
  ];

  return {
    text: lines.join('\n'),
    usedJobDescription: Boolean(description),
    usedBriefing: Boolean(briefingContent),
  };
}

/** The user's free-text steer: optional, trimmed and capped. */
export function normaliseMockPrompt(raw: string | undefined): string | null {
  const prompt = raw?.trim();
  if (!prompt) return null;
  if (prompt.length > AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS) {
    throw new ValidationError(
      `Prompt must be at most ${AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS} characters`,
    );
  }
  return prompt;
}
