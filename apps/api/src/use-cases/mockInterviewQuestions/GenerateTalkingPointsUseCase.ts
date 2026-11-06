import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import {
  talkingPointsPrompt,
  talkingPointsResponseSchema,
} from '#src/use-cases/prompts/talkingPoints.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import {
  INTERVIEW_QUESTION_LIMITS,
  MOCK_QUESTION_GENERATION,
  AI_FEATURE,
  AI_REASONING_DEFAULTS,
} from '#src/use-cases/constants.js';
import {
  buildMockInterviewContext,
  normaliseMockPrompt,
} from '#src/use-cases/mockInterviewQuestions/mockInterviewContext.js';
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

    const prompt = normaliseMockPrompt(input.prompt);

    const question = await this.deps.mockInterviewQuestionRepository.findById(input.questionId);
    if (!question) throw new NotFoundError('Practice question not found');

    const round = await findOwnedInterviewRound(this.deps, input.userId, question.interviewRoundId);
    const app = await this.deps.applicationRepository.findById(round.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.TALKING_POINTS,
      promptVersion: talkingPointsPrompt.version,
    });
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

    const messages = talkingPointsPrompt.build({
      contextText: context.text,
      backgroundText: background.text,
      question: question.question,
      request: prompt,
      customAiPrompt: user?.customAiPrompt,
    });

    const result = await llmProvider.complete(
      messages,
      MOCK_QUESTION_GENERATION.TALKING_POINTS_MAX_TOKENS,
      undefined,
      { reasoning: AI_REASONING_DEFAULTS.TALKING_POINTS },
    );
    assertNotTruncated(result);
    const parsed = parseAiJson(result.content, talkingPointsResponseSchema);

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
