import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { InterviewQuestionRef } from '#src/http/schema/types/InterviewQuestionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('interviewQuestions', (t) =>
  t.field({
    type: [InterviewQuestionRef],
    args: {
      interviewRoundId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { interviewQuestionResolver } = ctx.diScope.cradle;
      return interviewQuestionResolver.getInterviewQuestions(ctx.user.sub, args.interviewRoundId);
    },
  }),
);
