import { z } from 'zod';
import {
  AI_FEATURE,
  MOCK_INTERVIEW_PROMPT_TASK,
  MOCK_QUESTION_GENERATION,
} from '#src/use-cases/constants.js';
import { promptMessages } from '#src/use-cases/prompts/shared.js';
import {
  fenceUserInstructions,
  USER_INSTRUCTIONS_RULE,
} from '#src/use-cases/shared/aiInstructions.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface TalkingPointsPromptInput {
  /** The role, round, job description and briefing, from `buildMockInterviewContext`. */
  contextText: string;
  /** The candidate's profile or resume, from `buildCandidateBackground`. */
  backgroundText: string;
  question: string;
  /** The candidate's own steer, already trimmed and capped. */
  request?: string | null;
  customAiPrompt: string | null | undefined;
}

// `MOCK_INTERVIEW_PROMPT_TASK.TALKING_POINTS` is what the fake LLM route looks
// for to answer this prompt with cited points, so it must stay in the system text.
const SYSTEM_PROMPT = `You are an interview coach helping a candidate prepare. Given an interview question, the role and the candidate's own background, ${MOCK_INTERVIEW_PROMPT_TASK.TALKING_POINTS}.

Rules:
- Use only facts that appear in the candidate's profile or resume. Never invent employers, projects, numbers, skills or achievements, and never carry over details from the job description as if the candidate had done them.
- Each point is one short sentence the candidate could say, starting with a verb where possible (for example "Mention the Postgres replica migration at Acme").
- For each point, "source" names the profile or resume entry it comes from, such as the employer and role, the institution, or the skill.
- If nothing in the background is relevant to the question, return an empty list. An empty list is a correct answer; do not stretch to fill it.
- Give at most ${MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_COUNT} points, most relevant first.
- The candidate may steer which experience to lean on. That never lets you use anything outside their profile or resume.
${USER_INSTRUCTIONS_RULE}

Respond with ONLY a JSON object: {"points": [{"point": "...", "source": "..."}]}. No markdown and no commentary.`;

export const talkingPointsPrompt: PromptDefinition<TalkingPointsPromptInput> = {
  id: AI_FEATURE.TALKING_POINTS,
  version: 2,
  build: ({ contextText, backgroundText, question, request, customAiPrompt }) =>
    promptMessages({
      system: SYSTEM_PROMPT,
      customAiPrompt,
      user: [
        contextText,
        `\nInterview question:\n${wrapUntrustedContent(question)}`,
        backgroundText,
        ...(request ? [`\nThe candidate's request:\n${fenceUserInstructions(request)}`] : []),
      ].join('\n'),
    }),
};

/** The reply `talkingPointsPrompt` asks for. */
export const talkingPointsResponseSchema = z.object({
  points: z.array(z.object({ point: z.string(), source: z.string() })),
});
