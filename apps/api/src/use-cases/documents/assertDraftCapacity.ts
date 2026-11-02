import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';

/**
 * Every way of adding a draft (typed in, AI cover letter, AI resume) must pass
 * this, or the cap on `CONTENT_LIMITS.DOCUMENT_DRAFTS_PER_APPLICATION` only
 * holds for one of them (JEF-339). The generators call it *before* the model,
 * so a full application does not spend the user's tokens on a draft that
 * cannot be saved.
 */
export async function assertDraftCapacity(
  repository: Pick<IDocumentDraftRepository, 'countByApplicationId'>,
  applicationId: string,
): Promise<void> {
  assertUnderLimit(
    await repository.countByApplicationId(applicationId),
    CONTENT_LIMITS.DOCUMENT_DRAFTS_PER_APPLICATION,
    'document drafts on this application',
  );
}
