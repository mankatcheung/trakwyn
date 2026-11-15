import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ResumeGapsRef } from '#src/http/schema/types/ResumeGapsType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('dismissResumeGap', (t) =>
  t.field({
    type: ResumeGapsRef,
    description:
      'Answer "no" to one resume gap question for an application, so it is not asked again. Returns the questions that are left.',
    args: {
      applicationId: t.arg.id({ required: true }),
      key: t.arg.string({
        required: true,
        description: 'The requirement as shown, or "role:<workExperienceId>".',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { dismissResumeGapUseCase } = ctx.diScope.cradle;
      try {
        return await dismissResumeGapUseCase.execute({
          userId: ctx.user.sub,
          applicationId: String(args.applicationId),
          key: args.key,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
