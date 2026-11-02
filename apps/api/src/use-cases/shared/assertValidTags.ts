import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import { QuotaExceededError } from '#src/use-cases/errors/DomainError.js';
import { assertMaxLength } from '#src/use-cases/shared/assertUnderLimit.js';

/**
 * The tag list one create/update call may carry (JEF-339). The array is bounded
 * by `TAGS_PER_APPLICATION` because the call replaces the application's tags,
 * so its length is the count the application ends up with. Bulk "add tag" goes
 * through `UpdateApplicationUseCase`, so it is covered here too.
 */
export function assertValidTags(tags: readonly string[]): void {
  if (tags.length > CONTENT_LIMITS.TAGS_PER_APPLICATION) {
    throw new QuotaExceededError(
      `You have reached the maximum of ${CONTENT_LIMITS.TAGS_PER_APPLICATION} tags on this application`,
    );
  }
  for (const name of tags) {
    assertMaxLength(name, FIELD_LENGTH_LIMITS.TAG_NAME, 'A tag');
  }
}
