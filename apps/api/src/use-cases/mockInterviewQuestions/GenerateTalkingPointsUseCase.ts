import { z } from 'zod';
import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  INTERVIEW_QUESTION_LIMITS,
  MOCK_INTERVIEW_PROMPT_TASK,
  MOCK_QUESTION_GENERATION,
} from '#src/use-cases/constants.js';
import { buildMockInterviewContext } from '#src/use-cases/mockInterviewQuestions/mockInterviewContext.js';
import {
  buildCandidateBackground,
  type CandidateBackgroundDeps,
} from '#src/use-cases/mockInterviewQuestions/candidateBackground.js';
import type {
  IGenerateTalkingPointsUseCase,
  GenerateTalkingPointsInput,
  GenerateTalkingPointsOutput,
} from '#src/use-cases/mockInterviewQuestions/IGenerateTalkingPointsUseCase.js';

interface Deps extends CandidateBackgroundDeps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
  userRepository: IUserRepository;
  companyBriefingRepository: ICompanyBriefingRepository;
  generateMockTalkingPointsRateLimiter: IRateLimiter;
}

const pointsSchema = z.object({
  points: z.array(z.object({ point: z.string(), source: z.string() })),
});

const SYSTEM_PROMPT = `You are an interview coach helping a candidate prepare. Given an interview question, the role and the candidate's own background, ${MOCK_INTERVIEW_PROMPT_TASK.TALKING_POINTS}.

Rules:
- Use only facts that appear in the candidate's profile or resume. Never invent employers, projects, numbers, skills or achievements, and never carry over details from the job description as if the candidate had done them.
- Each point is one short sentence the candidate could say, starting with a verb where possible (for example "Mention the Postgres replica migration at Acme").
- For each point, "source" names the profile or resume entry it comes from, such as the employer and role, the institution, or the skill.
- If nothing in the background is relevant to the question, return an empty list. An empty list is a correct answer; do not stretch to fill it.
- Give at most ${MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_COUNT} points, most relevant first.

Respond with ONLY a JSON object: {"points": [{"point": "...", "source": "..."}]}. No markdown and no commentary.`;

export class GenerateTalkingPointsUseCase implements IGenerateTalkingPointsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateTalkingPointsInput): Promise<GenerateTalkingPointsOutput> {
    if (
      !(await this.deps.generateMockTalkingPointsRateLimiter.consume(
        `mock-talking-points:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const question = await this.deps.mockInterviewQuestionRepository.findById(input.questionId);
    if (!question) throw new NotFoundError('Practice question not found');

    const round = await findOwnedInterviewRound(this.deps, input.userId, question.interviewRoundId);
    const app = await this.deps.applicationRepository.findById(round.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId);
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const background = await buildCandidateBackground(this.deps, {
      userId: input.userId,
      useProfile: input.useProfile ?? true,
      documentId: input.documentId,
    });
    const used = { usedProfile: background.usedProfile, usedDocument: background.usedDocument };

    // No background means nothing to ground a point in: say so without asking the model.
    if (!background.text) return { question, talkingPoints: null, nothingRelevant: true, ...used };

    const [user, briefing] = await Promise.all([
      this.deps.userRepository.findById(input.userId),
      this.deps.companyBriefingRepository.findByApplicationId(app.id),
    ]);
    const context = buildMockInterviewContext(app, round, briefing);

    const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (user?.customAiPrompt) {
      messages.push({ role: 'system', content: user.customAiPrompt });
    }
    messages.push({
      role: 'user',
      content: [
        context.text,
        `\nInterview question:\n${wrapUntrustedContent(question.question)}`,
        background.text,
      ].join('\n'),
    });

    const result = await llmProvider.complete(
      messages,
      MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_TOKENS,
    );
    assertNotTruncated(result);
    const parsed = parseAiJson(result.content, pointsSchema);

    const points = cleanPoints(parsed.points);
    if (points.length === 0)
      return { question, talkingPoints: null, nothingRelevant: true, ...used };

    const talkingPoints = points.map((point) => `- ${point}`).join('\n');
    if (input.save === false) return { question, talkingPoints, nothingRelevant: false, ...used };

    const saved = await this.deps.mockInterviewQuestionRepository.update(question.id, {
      talkingPoints,
    });
    return { question: saved, talkingPoints, nothingRelevant: false, ...used };
  }
}

/**
 * Trims, caps and de-duplicates the points. A point with no cited source is
 * dropped: the source is what ties it to the candidate's own experience.
 */
function cleanPoints(raw: { point: string; source: string }[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of raw) {
    const point = oneLine(entry.point).slice(0, INTERVIEW_QUESTION_LIMITS.TALKING_POINT_MAX_CHARS);
    const source = oneLine(entry.source).slice(
      0,
      INTERVIEW_QUESTION_LIMITS.TALKING_POINT_SOURCE_MAX_CHARS,
    );
    const key = point.toLowerCase();
    if (!point || !source || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(`${point} (${source})`);
    if (cleaned.length === MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_COUNT) break;
  }
  return cleaned;
}

function oneLine(text: string): string {
  return text
    .replace(/^[-*•\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
