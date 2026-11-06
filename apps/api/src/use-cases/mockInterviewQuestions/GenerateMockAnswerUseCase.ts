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
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { assertNotTruncated } from '#src/use-cases/shared/parseAiJson.js';
import { mockAnswerPrompt } from '#src/use-cases/prompts/mockAnswer.js';
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
  IGenerateMockAnswerUseCase,
  GenerateMockAnswerInput,
  GenerateMockAnswerOutput,
} from '#src/use-cases/mockInterviewQuestions/IGenerateMockAnswerUseCase.js';

interface Deps extends CandidateBackgroundDeps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
  userRepository: IUserRepository;
  companyBriefingRepository: ICompanyBriefingRepository;
  generateMockAnswerRateLimiter: IRateLimiter;
}

export class GenerateMockAnswerUseCase implements IGenerateMockAnswerUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateMockAnswerInput): Promise<GenerateMockAnswerOutput> {
    if (
      !(await this.deps.generateMockAnswerRateLimiter.consume(`mock-answer:user:${input.userId}`))
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
      feature: AI_FEATURE.MOCK_ANSWER,
      promptVersion: mockAnswerPrompt.version,
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

    const messages = mockAnswerPrompt.build({
      contextText: context.text,
      backgroundText: background.text,
      question: question.question,
      request: prompt,
      customAiPrompt: user?.customAiPrompt,
    });

    const result = await llmProvider.complete(
      messages,
      MOCK_QUESTION_GENERATION.ANSWER_MAX_TOKENS,
      undefined,
      { reasoning: AI_REASONING_DEFAULTS.MOCK_ANSWER },
    );
    assertNotTruncated(result);

    const answer = result.content
      .trim()
      .slice(0, INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS)
      .trim();
    if (!answer) {
      throw new AiResponseInvalidError("The AI didn't return an answer — please try again");
    }

    return {
      answer,
      usedJobDescription: context.usedJobDescription,
      usedBriefing: context.usedBriefing,
      usedProfile: background.usedProfile,
      usedDocument: background.usedDocument,
    };
  }
}
