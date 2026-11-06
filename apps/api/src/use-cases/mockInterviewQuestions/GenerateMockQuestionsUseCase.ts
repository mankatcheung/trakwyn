import {
  AiNotConfiguredError,
  AiResponseInvalidError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import {
  buildCandidateBackground,
  type CandidateBackgroundDeps,
} from '#src/use-cases/mockInterviewQuestions/candidateBackground.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import {
  mockQuestionsPrompt,
  mockQuestionsResponseSchema,
} from '#src/use-cases/prompts/mockQuestions.js';
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
import type {
  IGenerateMockQuestionsUseCase,
  GenerateMockQuestionsInput,
  GenerateMockQuestionsOutput,
} from '#src/use-cases/mockInterviewQuestions/IGenerateMockQuestionsUseCase.js';

interface Deps extends CandidateBackgroundDeps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  userRepository: IUserRepository;
  companyBriefingRepository: ICompanyBriefingRepository;
  generateMockQuestionsRateLimiter: IRateLimiter;
}

export class GenerateMockQuestionsUseCase implements IGenerateMockQuestionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateMockQuestionsInput): Promise<GenerateMockQuestionsOutput> {
    if (
      !(await this.deps.generateMockQuestionsRateLimiter.consume(
        `mock-questions:user:${input.userId}`,
      ))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const prompt = normaliseMockPrompt(input.prompt);
    const count = clampCount(input.count);

    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);
    const app = await this.deps.applicationRepository.findById(round.applicationId);
    // findOwnedInterviewRound has already proven the application exists and is the user's.
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.MOCK_QUESTIONS,
      promptVersion: mockQuestionsPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const [user, briefing] = await Promise.all([
      this.deps.userRepository.findById(input.userId),
      this.deps.companyBriefingRepository.findByApplicationId(app.id),
    ]);
    const context = buildMockInterviewContext(app, round, briefing);
    const background = await buildCandidateBackground(this.deps, {
      userId: input.userId,
      useProfile: input.useProfile ?? false,
      documentId: input.documentId,
    });

    const messages = mockQuestionsPrompt.build({
      count,
      contextText: context.text,
      backgroundText: background.text,
      focus: prompt,
      customAiPrompt: user?.customAiPrompt,
    });

    const result = await llmProvider.complete(
      messages,
      MOCK_QUESTION_GENERATION.QUESTIONS_MAX_TOKENS,
      undefined,
      { reasoning: AI_REASONING_DEFAULTS.MOCK_QUESTIONS },
    );
    assertNotTruncated(result);
    const parsed = parseAiJson(result.content, mockQuestionsResponseSchema);

    const suggestions = cleanQuestions(parsed.questions, count);
    if (suggestions.length === 0) {
      throw new AiResponseInvalidError(
        "The AI didn't return any usable questions — please try again",
      );
    }

    return {
      suggestions,
      usedJobDescription: context.usedJobDescription,
      usedBriefing: context.usedBriefing,
      usedProfile: background.usedProfile,
      usedDocument: background.usedDocument,
    };
  }
}

function clampCount(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return MOCK_QUESTION_GENERATION.DEFAULT_COUNT;
  }
  return Math.min(Math.max(Math.trunc(requested), 1), MOCK_QUESTION_GENERATION.MAX_COUNT);
}

/** Trims, drops blanks and repeats, and caps each question to what can be saved. */
function cleanQuestions(raw: string[], count: number): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of raw) {
    const question = entry.trim().slice(0, INTERVIEW_QUESTION_LIMITS.QUESTION_MAX_CHARS).trim();
    const key = question.toLowerCase();
    if (!question || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(question);
    if (cleaned.length === count) break;
  }
  return cleaned;
}
