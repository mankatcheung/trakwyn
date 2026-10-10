import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { MockInterviewQuestionRef } from '#src/http/schema/types/MockInterviewQuestionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('mockInterviewQuestions', (t) =>
  t.field({
    type: [MockInterviewQuestionRef],
    args: {
      interviewRoundId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      return mockInterviewQuestionResolver.getMockInterviewQuestions(
        ctx.user.sub,
        args.interviewRoundId,
      );
    },
  }),
);
