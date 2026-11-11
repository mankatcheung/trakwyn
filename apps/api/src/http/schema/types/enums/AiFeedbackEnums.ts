import { builder } from '#src/http/schema/builder.js';
import {
  AI_FEEDBACK_RATING,
  AI_FEEDBACK_REASON,
  AI_FEEDBACK_TARGET,
} from '#src/use-cases/constants.js';

export const AiFeedbackRatingEnum = builder.enumType('AiFeedbackRating', {
  values: {
    UP: { value: AI_FEEDBACK_RATING.UP },
    DOWN: { value: AI_FEEDBACK_RATING.DOWN },
  },
});

/** The fixed list of reasons for a thumbs down. There is no free-text reason, on purpose (JEF-547). */
export const AiFeedbackReasonEnum = builder.enumType('AiFeedbackReason', {
  values: {
    WRONG_OR_MADE_UP: { value: AI_FEEDBACK_REASON.WRONG_OR_MADE_UP },
    IGNORED_MY_REQUEST: { value: AI_FEEDBACK_REASON.IGNORED_MY_REQUEST },
    UNSAFE_OR_INAPPROPRIATE: { value: AI_FEEDBACK_REASON.UNSAFE_OR_INAPPROPRIATE },
    NOT_USEFUL: { value: AI_FEEDBACK_REASON.NOT_USEFUL },
    OTHER: { value: AI_FEEDBACK_REASON.OTHER },
  },
});

export const AiFeedbackTargetEnum = builder.enumType('AiFeedbackTarget', {
  values: {
    CHAT_MESSAGE: { value: AI_FEEDBACK_TARGET.CHAT_MESSAGE },
    DOCUMENT_DRAFT: { value: AI_FEEDBACK_TARGET.DOCUMENT_DRAFT },
  },
});
