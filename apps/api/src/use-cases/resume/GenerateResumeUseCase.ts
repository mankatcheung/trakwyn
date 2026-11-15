import {
  AiNotConfiguredError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { INoteRepository } from '#src/use-cases/ports/INoteRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import { formatApplicationContext } from '#src/use-cases/shared/applicationContext.js';
import { formatCrossApplicationContext } from '#src/use-cases/shared/crossApplicationContext.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import { resumePrompt, resumeResponseSchema } from '#src/use-cases/prompts/resume.js';
import { assertNotTruncated, parseAiJson } from '#src/use-cases/shared/parseAiJson.js';
import { normaliseAiInstructions } from '#src/use-cases/shared/aiInstructions.js';
import { postingForPrompt } from '#src/use-cases/shared/postingForPrompt.js';
import {
  loadUserProfile,
  formatUserProfile,
  isUserProfileEmpty,
  type UserProfileRepositories,
} from '#src/use-cases/shared/userProfile.js';
import { applyProfileFacts, assertGrounded } from '#src/use-cases/resume/resumeGrounding.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IExtractPostingRequirementsUseCase } from '#src/use-cases/postingRequirements/ExtractPostingRequirementsUseCase.js';
import type { ResumePromptRequirements } from '#src/use-cases/prompts/resume.js';
import { AI_PROMPT_INPUT, AI_FEATURE, AI_REASONING_DEFAULTS } from '#src/use-cases/constants.js';
import type { LLMAnsweredBy } from '#src/use-cases/ports/ILLMProvider.js';

export interface GenerateResumeInput {
  applicationId: string;
  userId: string;
  /** The user's own steer (JEF-506): tone, focus, length. Never the format. */
  instructions?: string | null;
  /**
   * Told which provider and model answered (JEF-547), so a caller that saves the
   * output can snapshot it. Not called when the call is not usage-tracked.
   */
  onAnswered?: (answeredBy: LLMAnsweredBy | undefined) => void;
}

interface Deps extends UserProfileRepositories {
  llmProviderFactory: ILLMProviderFactory;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  generateResumeRateLimiter: IRateLimiter;
  noteRepository: INoteRepository;
  documentDraftRepository: IDocumentDraftRepository;
  /** Optional so the eval harness and unit tests need none. */
  logger?: ILogger;
  /** Optional for the same reason; without it the resume is tailored to the posting text alone. */
  extractPostingRequirementsUseCase?: IExtractPostingRequirementsUseCase;
}

export class GenerateResumeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GenerateResumeInput): Promise<ResumeContent> {
    const instructions = normaliseAiInstructions(input.instructions);
    if (!(await this.deps.generateResumeRateLimiter.consume(`resume:user:${input.userId}`))) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const profile = await loadUserProfile(this.deps, input.userId);
    if (isUserProfileEmpty(profile)) {
      // Nothing truthful to build from. Asking the model anyway is an
      // invitation to invent an entire history.
      throw new ValidationError(
        'Add your work experience, education or skills in Settings before generating a resume',
      );
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.RESUME,
      promptVersion: resumePrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const [user, notes] = await Promise.all([
      this.deps.userRepository.findById(input.userId),
      this.deps.noteRepository.findAllByApplicationId(input.applicationId),
    ]);
    // Notes only, no company briefing: a resume is about the candidate, and
    // the briefing is unverified model output about the employer. Nothing in
    // it belongs in a document asserting this person's history (JEF-205).
    const context = formatApplicationContext({ notes, briefing: null });

    // Only fetched when the user opted in (JEF-249). Voice/phrasing only —
    // `assertGrounded` below is what actually stops an employer or
    // institution named in this context from ending up asserted as fact.
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

    const requirements = await this.requirementsFor(input);

    const messages = resumePrompt.build({
      // The full posting when it was captured, not the summary (JEF-591).
      app: { ...app, description: postingForPrompt(app) },
      profileText: formatUserProfile(profile, { maxChars: AI_PROMPT_INPUT.PROFILE_MAX_CHARS }),
      applicationContext: context,
      crossApplicationContext,
      customAiPrompt: user?.customAiPrompt,
      instructions,
      requirements,
    });

    const result = await llmProvider.complete(messages, 2048, undefined, {
      json: true,
      reasoning: AI_REASONING_DEFAULTS.RESUME,
    });
    input.onAnswered?.(result.answeredBy);
    assertNotTruncated(result);
    const resume = parseAiJson<ResumeContent>(result.content, resumeResponseSchema);
    assertGrounded(resume, profile);

    // The stored dates, titles and skills, in place of the model's (JEF-597).
    const grounded = applyProfileFacts(resume, profile);
    const { periods, titles, skillsDropped } = grounded.corrections;
    if (titles > 0 || skillsDropped > 0) {
      // Periods are rewritten on almost every reply (the model's format differs),
      // so only a changed title or a dropped skill is worth a line. Counts only.
      this.deps.logger?.info('A generated resume was corrected against the profile', {
        event: 'resume.grounding.corrected',
        periods,
        titles,
        skills_dropped: skillsDropped,
        prompt_version: resumePrompt.version,
      });
    }
    return grounded.resume;
  }

  /**
   * What the posting asks for, to tailor against (JEF-593). The saved list is
   * reused while the posting is unchanged, so this is a model call only the
   * first time a posting is used.
   *
   * It is an improvement to the resume, never a condition of it: an
   * application with no posting, a rate limit, spent credits or a reply the
   * model got wrong all leave the resume to be written from the posting text
   * alone, as it was before.
   */
  private async requirementsFor(
    input: GenerateResumeInput,
  ): Promise<ResumePromptRequirements | null> {
    if (!this.deps.extractPostingRequirementsUseCase) return null;
    try {
      return await this.deps.extractPostingRequirementsUseCase.execute({
        userId: input.userId,
        applicationId: input.applicationId,
      });
    } catch (err) {
      // "No posting on this application" is the ordinary case, not a fault.
      if (!(err instanceof ValidationError)) {
        this.deps.logger?.warn('Could not read the posting requirements for a resume', err, {
          event: 'resume.requirements.unavailable',
        });
      }
      return null;
    }
  }
}
