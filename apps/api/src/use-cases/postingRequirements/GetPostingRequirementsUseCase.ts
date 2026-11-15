import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IPostingRequirementsRepository } from '#src/use-cases/ports/IPostingRequirementsRepository.js';
import { hashJobDescription } from '#src/use-cases/shared/hashJobDescription.js';
import { postingForPrompt } from '#src/use-cases/shared/postingForPrompt.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import {
  isCurrent,
  type PostingRequirementsView,
} from '#src/use-cases/postingRequirements/postingRequirementsView.js';

export interface GetPostingRequirementsInput {
  userId: string;
  applicationId: string;
}

interface Deps {
  applicationRepository: IApplicationRepository;
  postingRequirementsRepository: IPostingRequirementsRepository;
}

/**
 * The saved requirements for an application, or `null` when its posting has
 * never been read. Never calls a model: reading a page must not spend the
 * user's AI budget. `isStale` says the posting was edited since, so the client
 * can offer to read it again.
 */
export class GetPostingRequirementsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetPostingRequirementsInput): Promise<PostingRequirementsView | null> {
    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden');

    const saved = await this.deps.postingRequirementsRepository.findByApplicationId(
      input.applicationId,
    );
    if (!saved) return null;

    const posting = postingForPrompt(app)?.slice(0, AI_PROMPT_INPUT.POSTING_REQUIREMENTS_MAX_CHARS);
    return { ...saved, isStale: !posting || !isCurrent(saved, hashJobDescription(posting)) };
  }
}
