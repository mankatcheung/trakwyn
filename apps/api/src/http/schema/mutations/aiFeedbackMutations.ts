import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { AiRatingRef } from '#src/http/schema/types/AiRatingType.js';
import {
  AiFeedbackRatingEnum,
  AiFeedbackReasonEnum,
  AiFeedbackTargetEnum,
} from '#src/http/schema/types/enums/AiFeedbackEnums.js';
import { toAiRatingDTO } from '#src/interface-adapters/mappers/AiRatingMapper.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

/**
 * Thumbs up/down on an AI output (JEF-547). Not on the email-verification
 * allowlist, so the wall covers it like `confirmChatAction`. The client names
 * the output by id and kind; what the model and prompt were is read from the
 * stored message or draft, never trusted from the client.
 */
builder.mutationField('rateAiOutput', (t) =>
  t.field({
    type: AiRatingRef,
    args: {
      targetKind: t.arg({ type: AiFeedbackTargetEnum, required: true }),
      targetId: t.arg.id({ required: true }),
      rating: t.arg({ type: AiFeedbackRatingEnum, required: true }),
      reason: t.arg({ type: AiFeedbackReasonEnum, required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { rateAiOutputUseCase } = ctx.diScope.cradle;
      try {
        const feedback = await rateAiOutputUseCase.execute({
          userId: ctx.user.sub,
          targetKind: args.targetKind,
          targetId: String(args.targetId),
          rating: args.rating,
          reason: args.reason,
        });
        // A saved rating always maps: the null branch is only for a missing row.
        return toAiRatingDTO(feedback)!;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('clearAiOutputRating', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      targetKind: t.arg({ type: AiFeedbackTargetEnum, required: true }),
      targetId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { clearAiOutputRatingUseCase } = ctx.diScope.cradle;
      try {
        await clearAiOutputRatingUseCase.execute({
          userId: ctx.user.sub,
          targetKind: args.targetKind,
          targetId: String(args.targetId),
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
