import type { AiFeedback } from '#src/domain/aiFeedback/AiFeedback.js';
import type { AiFeedbackRating, AiFeedbackReason } from '#src/use-cases/constants.js';

export type AiRatingDTO = {
  rating: AiFeedbackRating;
  reason: AiFeedbackReason | null;
};

/** The rating and reason only: the rest of an `AiFeedback` row is for us, not the client. */
export function toAiRatingDTO(
  feedback: Pick<AiFeedback, 'rating' | 'reason'> | null | undefined,
): AiRatingDTO | null {
  if (!feedback) return null;
  return {
    rating: feedback.rating as AiFeedbackRating,
    reason: feedback.reason as AiFeedbackReason | null,
  };
}
