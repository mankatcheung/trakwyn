import {
  AiNotConfiguredError,
  AiResponseInvalidError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { assertNotTruncated } from '#src/use-cases/shared/parseAiJson.js';
import { normaliseAiInstructions } from '#src/use-cases/shared/aiInstructions.js';
import { polishDraftPrompt } from '#src/use-cases/prompts/polishDraft.js';
import {
  AI_FEATURE,
  AI_PROMPT_INPUT,
  AI_REASONING_DEFAULTS,
  POLISH_DRAFT_MAX_TOKENS,
} from '#src/use-cases/constants.js';
import type {
  IPolishDocumentDraftUseCase,
  PolishDocumentDraftInput,
  PolishDocumentDraftOutput,
} from '#src/use-cases/documents/IPolishDocumentDraftUseCase.js';

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  documentDraftRepository: IDocumentDraftRepository;
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  polishDocumentDraftRateLimiter: IRateLimiter;
}

/**
 * Polishes text the user wrote (JEF-506) and returns it for review. Nothing is
 * saved: the text may be unsaved editor content, and the user decides whether
 * the proposal replaces it.
 */
export class PolishDocumentDraftUseCase implements IPolishDocumentDraftUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: PolishDocumentDraftInput): Promise<PolishDocumentDraftOutput> {
    const instructions = normaliseAiInstructions(input.instructions);
    const text = input.plainText.trim();
    if (!text) throw new ValidationError('There is no text to polish');
    if (text.length > AI_PROMPT_INPUT.POLISH_DOCUMENT_MAX_CHARS) {
      throw new ValidationError(
        `The text must be at most ${AI_PROMPT_INPUT.POLISH_DOCUMENT_MAX_CHARS} characters to polish`,
      );
    }

    const draft = await this.deps.documentDraftRepository.findById(input.draftId);
    if (!draft) throw new NotFoundError('Document draft not found');
    const app = await this.deps.applicationRepository.findById(draft.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    if (
      !(await this.deps.polishDocumentDraftRateLimiter.consume(`polish-draft:user:${input.userId}`))
    ) {
      throw new RateLimitedError('Too many requests — please wait a moment and try again');
    }

    const llmProvider = await this.deps.llmProviderFactory.forUser(input.userId, {
      feature: AI_FEATURE.POLISH_DRAFT,
      promptVersion: polishDraftPrompt.version,
    });
    if (!llmProvider) {
      throw new AiNotConfiguredError('Add your AI API key in Settings to use this feature');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    const messages = polishDraftPrompt.build({
      type: draft.type,
      text,
      instructions,
      customAiPrompt: user?.customAiPrompt,
    });

    const result = await llmProvider.complete(messages, POLISH_DRAFT_MAX_TOKENS, undefined, {
      reasoning: AI_REASONING_DEFAULTS.POLISH_DRAFT,
    });
    assertNotTruncated(result);

    const markdown = result.content.trim();
    if (!markdown) {
      throw new AiResponseInvalidError("The AI didn't return any text — please try again");
    }
    return { markdown };
  }
}
