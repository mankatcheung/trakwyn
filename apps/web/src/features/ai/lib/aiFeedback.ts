/**
 * Thumbs up/down on AI output (JEF-547). The API stores which model and prompt
 * wrote the output and the rating, never the text, so all the client sends is
 * the output's kind and id. The documents are inline strings, like the rest of
 * the settings and billing queries, so there is no codegen change.
 */

export type AiFeedbackTarget = 'CHAT_MESSAGE' | 'DOCUMENT_DRAFT';
export type AiFeedbackRatingValue = 'UP' | 'DOWN';

/** The fixed list of reasons for a thumbs down, in the order they are offered. No free text, on purpose. */
export const AI_FEEDBACK_REASONS = [
  'WRONG_OR_MADE_UP',
  'IGNORED_MY_REQUEST',
  'UNSAFE_OR_INAPPROPRIATE',
  'NOT_USEFUL',
  'OTHER',
] as const;

export type AiFeedbackReason = (typeof AI_FEEDBACK_REASONS)[number];

/** The caller's own rating of one output, as the API returns it. */
export interface AiRating {
  rating: AiFeedbackRatingValue;
  reason: AiFeedbackReason | null;
}

export const RATE_AI_OUTPUT = `
  mutation RateAiOutput(
    $targetKind: AiFeedbackTarget!
    $targetId: ID!
    $rating: AiFeedbackRating!
    $reason: AiFeedbackReason
  ) {
    rateAiOutput(targetKind: $targetKind, targetId: $targetId, rating: $rating, reason: $reason) {
      rating
      reason
    }
  }
`;

export const CLEAR_AI_OUTPUT_RATING = `
  mutation ClearAiOutputRating($targetKind: AiFeedbackTarget!, $targetId: ID!) {
    clearAiOutputRating(targetKind: $targetKind, targetId: $targetId)
  }
`;
