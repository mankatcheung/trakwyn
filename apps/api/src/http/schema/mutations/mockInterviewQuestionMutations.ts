import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import {
  AnswerSourceEnum,
  MockInterviewQuestionRef,
} from '#src/http/schema/types/MockInterviewQuestionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const CreateMockInterviewQuestionInput = builder.inputType('CreateMockInterviewQuestionInput', {
  fields: (t) => ({
    interviewRoundId: t.id({ required: true }),
    question: t.string({ required: true }),
    answer: t.string({ required: false }),
    /** `AI` when the answer is a saved AI draft. */
    answerSource: t.field({ type: AnswerSourceEnum, required: false }),
  }),
});

const UpdateMockInterviewQuestionInput = builder.inputType('UpdateMockInterviewQuestionInput', {
  fields: (t) => ({
    question: t.string({ required: false }),
    answer: t.string({ required: false }),
    /** Omit when editing so an AI answer keeps its label; set `ai` when saving an AI draft. */
    answerSource: t.field({ type: AnswerSourceEnum, required: false }),
  }),
});

builder.mutationField('createMockInterviewQuestion', (t) =>
  t.field({
    type: MockInterviewQuestionRef,
    args: {
      input: t.arg({ type: CreateMockInterviewQuestionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      return mockInterviewQuestionResolver.createMockInterviewQuestion(ctx.user.sub, {
        roundId: args.input.interviewRoundId,
        question: args.input.question,
        answer: args.input.answer ?? null,
        answerSource: args.input.answerSource ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateMockInterviewQuestion', (t) =>
  t.field({
    type: MockInterviewQuestionRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateMockInterviewQuestionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      return mockInterviewQuestionResolver.updateMockInterviewQuestion(ctx.user.sub, args.id, {
        question: args.input.question ?? undefined,
        // Omitted leaves the answer alone; an explicit null clears it.
        answer: args.input.answer,
        answerSource: args.input.answerSource ?? undefined,
      });
    },
  }),
);

builder.mutationField('deleteMockInterviewQuestion', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      return mockInterviewQuestionResolver.deleteMockInterviewQuestion(ctx.user.sub, args.id);
    },
  }),
);

builder.mutationField('reorderMockInterviewQuestions', (t) =>
  t.field({
    type: [MockInterviewQuestionRef],
    args: {
      interviewRoundId: t.arg.id({ required: true }),
      orderedIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { mockInterviewQuestionResolver } = ctx.diScope.cradle;
      return mockInterviewQuestionResolver.reorderMockInterviewQuestions(
        ctx.user.sub,
        args.interviewRoundId,
        args.orderedIds.map(String),
      );
    },
  }),
);
