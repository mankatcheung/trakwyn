import type { PostingRequirements } from '#src/domain/postingRequirements/PostingRequirements.js';
import { postingRequirementsPrompt } from '#src/use-cases/prompts/postingRequirements.js';

/** Saved requirements plus whether the posting has changed since they were read. */
export interface PostingRequirementsView extends PostingRequirements {
  isStale: boolean;
}

/**
 * True while the saved list still describes the posting: the same text, read
 * by the prompt that is live now. A reworded prompt makes every saved list
 * stale once, so an improvement to it reaches postings that were read before.
 */
export function isCurrent(saved: PostingRequirements, postingHash: string): boolean {
  return (
    saved.postingHash === postingHash && saved.promptVersion === postingRequirementsPrompt.version
  );
}
