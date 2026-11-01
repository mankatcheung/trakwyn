import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { MockInterviewQuestionRef } from '#src/http/schema/types/MockInterviewQuestionType.js';
import type { GeneratedTalkingPointsDTO } from '#src/interface-adapters/resolvers/MockInterviewQuestionResolver.js';

interface GeneratedMockQuestionsDTO {
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
  usedProfile: boolean;
  usedDocument: boolean;
}

interface GeneratedMockAnswerDTO {
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
  usedProfile: boolean;
  usedDocument: boolean;
}

const GeneratedMockQuestionsRef =
  builder.objectRef<GeneratedMockQuestionsDTO>('GeneratedMockQuestions');
GeneratedMockQuestionsRef.implement({
  fields: (t) => ({
    suggestions: t.exposeStringList('suggestions'),
    usedJobDescription: t.exposeBoolean('usedJobDescription'),
    usedBriefing: t.exposeBoolean('usedBriefing'),
    usedProfile: t.exposeBoolean('usedProfile'),
    usedDocument: t.exposeBoolean('usedDocument'),
  }),
});

const GeneratedMockAnswerRef = builder.objectRef<GeneratedMockAnswerDTO>('GeneratedMockAnswer');
GeneratedMockAnswerRef.implement({
  fields: (t) => ({
    answer: t.exposeString('answer'),
    usedJobDescription: t.exposeBoolean('usedJobDescription'),
    usedBriefing: t.exposeBoolean('usedBriefing'),
    usedProfile: t.exposeBoolean('usedProfile'),
    usedDocument: t.exposeBoolean('usedDocument'),
  }),
});

const GeneratedTalkingPointsRef =
  builder.objectRef<GeneratedTalkingPointsDTO>('GeneratedTalkingPoints');
GeneratedTalkingPointsRef.implement({
  fields: (t) => ({
    question: t.field({ type: MockInterviewQuestionRef, resolve: (r) => r.question }),
    nothingRelevant: t.exposeBoolean('nothingRelevant'),
    usedProfile: t.exposeBoolean('usedProfile'),
    usedDocument: t.exposeBoolean('usedDocument'),
  }),
});

builder.mutationField('generateMockInterviewQuestions', (t) =>
  t.field({
    type: GeneratedMockQuestionsRef,
    args: {
      interviewRoundId: t.arg.id({ required: true }),
      prompt: t.arg.string({ required: false }),
      count: t.arg.int({ required: false }),
      useProfile: t.arg.boolean({ required: false }),
      documentId: t.arg.id({ required: false }),
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
          useProfile: args.useProfile ?? undefined,
          documentId: args.documentId ? String(args.documentId) : undefined,
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
      useProfile: t.arg.boolean({ required: false }),
      documentId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      try {
        return await mockInterviewQuestionResolver.generateMockAnswer(ctx.user.sub, {
          questionId: String(args.mockInterviewQuestionId),
          prompt: args.prompt ?? undefined,
          useProfile: args.useProfile ?? undefined,
          documentId: args.documentId ? String(args.documentId) : undefined,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('generateMockTalkingPoints', (t) =>
  t.field({
    type: GeneratedTalkingPointsRef,
    args: {
      mockInterviewQuestionId: t.arg.id({ required: true }),
      useProfile: t.arg.boolean({ required: false }),
      documentId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      try {
        return await mockInterviewQuestionResolver.generateMockTalkingPoints(ctx.user.sub, {
          questionId: String(args.mockInterviewQuestionId),
          useProfile: args.useProfile ?? undefined,
          documentId: args.documentId ? String(args.documentId) : undefined,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
