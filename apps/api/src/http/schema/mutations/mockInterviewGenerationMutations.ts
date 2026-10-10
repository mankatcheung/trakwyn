import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

interface GeneratedMockQuestionsDTO {
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

interface GeneratedMockAnswerDTO {
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

const GeneratedMockQuestionsRef =
  builder.objectRef<GeneratedMockQuestionsDTO>('GeneratedMockQuestions');
GeneratedMockQuestionsRef.implement({
  fields: (t) => ({
    suggestions: t.exposeStringList('suggestions'),
    usedJobDescription: t.exposeBoolean('usedJobDescription'),
    usedBriefing: t.exposeBoolean('usedBriefing'),
  }),
});

const GeneratedMockAnswerRef = builder.objectRef<GeneratedMockAnswerDTO>('GeneratedMockAnswer');
GeneratedMockAnswerRef.implement({
  fields: (t) => ({
    answer: t.exposeString('answer'),
    usedJobDescription: t.exposeBoolean('usedJobDescription'),
    usedBriefing: t.exposeBoolean('usedBriefing'),
  }),
});

builder.mutationField('generateMockInterviewQuestions', (t) =>
  t.field({
    type: GeneratedMockQuestionsRef,
    args: {
      interviewRoundId: t.arg.id({ required: true }),
      prompt: t.arg.string({ required: false }),
      count: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      try {
        return await mockInterviewQuestionResolver.generateMockQuestions(ctx.user.sub, {
          roundId: String(args.interviewRoundId),
          prompt: args.prompt ?? undefined,
          count: args.count ?? undefined,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('generateMockInterviewAnswer', (t) =>
  t.field({
    type: GeneratedMockAnswerRef,
    args: {
      mockInterviewQuestionId: t.arg.id({ required: true }),
      prompt: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      try {
        return await mockInterviewQuestionResolver.generateMockAnswer(ctx.user.sub, {
          questionId: String(args.mockInterviewQuestionId),
          prompt: args.prompt ?? undefined,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
