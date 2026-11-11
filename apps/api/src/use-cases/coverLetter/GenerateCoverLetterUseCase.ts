import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import { formatApplicationContext } from '#src/use-cases/shared/applicationContext.js';
import { formatCrossApplicationContext } from '#src/use-cases/shared/crossApplicationContext.js';
import { coverLetterPrompt } from '#src/use-cases/prompts/coverLetter.js';
import { loadUserProfile, formatUserProfile } from '#src/use-cases/shared/userProfile.js';
import { normaliseAiInstructions } from '#src/use-cases/shared/aiInstructions.js';
import { AI_PROMPT_INPUT, AI_FEATURE, AI_REASONING_DEFAULTS } from '#src/use-cases/constants.js';
import type { LLMAnsweredBy } from '#src/use-cases/ports/ILLMProvider.js';

export interface GenerateCoverLetterInput {
  applicationId: string;
  userId: string;
  resumeText?: string | null;
  /** The user's own steer (JEF-506): tone, focus, length. Never the format. */
  instructions?: string | null;
  /**
   * Told which provider and model answered (JEF-547), so a caller that saves the
   * output can snapshot it. Not called when the call is not usage-tracked.
   */
  onAnswered?: (answeredBy: LLMAnsweredBy | undefined) => void;
}

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  skillRepository: ISkillRepository;
  userRepository: IUserRepository;
  generateCoverLetterRateLimiter: IRateLimiter;
  noteRepository: INoteRepository;
  documentDraftRepository: IDocumentDraftRepository;
  companyBriefingRepository: ICompanyBriefingRepository;
}

export class GenerateCoverLetterUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateCoverLetterInput): Promise<string> {
    const instructions = normaliseAiInstructions(input.instructions);
    if (
      !(await this.deps.generateCoverLetterRateLimiter.consume(`cover-letter:user:${input.userId}`))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.COVER_LETTER,
      promptVersion: coverLetterPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    // Notes and the briefing are both optional — having neither is the normal
    // state, and generation works exactly as before when they are absent.
    const [profile, user, notes, briefing] = await Promise.all([
      loadUserProfile(this.deps, input.userId).then(formatUserProfile),
      this.deps.userRepository.findById(input.userId),
      this.deps.noteRepository.findAllByApplicationId(input.applicationId),
      this.deps.companyBriefingRepository.findByApplicationId(input.applicationId),
    ]);
    const context = formatApplicationContext({ notes, briefing });

    // Only fetched when the user opted in (JEF-249) — an extra pair of
    // queries across every generation otherwise, for a feature most users
    // haven't turned on.
    let crossApplicationContext = '';
    if (user?.useCrossApplicationContext) {
      const [otherNotes, otherCoverLetters] = await Promise.all([
        this.deps.noteRepository.findRecentByUserExcludingApplication(
          input.userId,
          input.applicationId,
          AI_PROMPT_INPUT.CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS,
        ),
        this.deps.documentDraftRepository.findRecentCoverLettersByUserExcludingApplication(
          input.userId,
          input.applicationId,
          AI_PROMPT_INPUT.CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS,
        ),
      ]);
      crossApplicationContext = formatCrossApplicationContext(otherNotes, otherCoverLetters);
    }

    const messages = coverLetterPrompt.build({
      app,
      profile,
      resumeText: input.resumeText,
      applicationContext: context,
      crossApplicationContext,
      customAiPrompt: user?.customAiPrompt,
      instructions,
    });

    const result = await llmProvider.complete(messages, 1024, undefined, {
      reasoning: AI_REASONING_DEFAULTS.COVER_LETTER,
    });
    input.onAnswered?.(result.answeredBy);
    return result.content;
  }
}
