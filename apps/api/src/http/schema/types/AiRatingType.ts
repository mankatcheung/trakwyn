import { builder } from '#src/http/schema/builder.js';
import type { AiRatingDTO } from '#src/interface-adapters/mappers/AiRatingMapper.js';
import {
  AiFeedbackRatingEnum,
  AiFeedbackReasonEnum,
} from '#src/http/schema/types/enums/AiFeedbackEnums.js';

export const AiRatingRef = builder.objectRef<AiRatingDTO>('AiRating');

/**
 * The caller's own thumbs up/down on one AI output (JEF-547). It carries the
 * rating and the optional fixed-list reason, never any text.
 */
builder.objectType(AiRatingRef, {
  fields: (t) => ({
    rating: t.field({ type: AiFeedbackRatingEnum, resolve: (r) => r.rating }),
    reason: t.field({ type: AiFeedbackReasonEnum, nullable: true, resolve: (r) => r.reason }),
  }),
});
