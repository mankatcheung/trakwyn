import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { InterviewQuestionRef } from '#src/http/schema/types/InterviewQuestionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const CreateInterviewQuestionInput = builder.inputType('CreateInterviewQuestionInput', {
  fields: (t) => ({
    interviewRoundId: t.id({ required: true }),
    question: t.string({ required: true }),
    answer: t.string({ required: false }),
  }),
});

const UpdateInterviewQuestionInput = builder.inputType('UpdateInterviewQuestionInput', {
  fields: (t) => ({
    question: t.string({ required: false }),
    answer: t.string({ required: false }),
  }),
});

builder.mutationField('createInterviewQuestion', (t) =>
  t.field({
    type: InterviewQuestionRef,
    args: {
      input: t.arg({ type: CreateInterviewQuestionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { interviewQuestionResolver } = ctx.diScope.cradle;
      return interviewQuestionResolver.createInterviewQuestion(ctx.user.sub, {
        roundId: args.input.interviewRoundId,
        question: args.input.question,
        answer: args.input.answer ?? null,
      });
    },
  }),
);

builder.mutationField('updateInterviewQuestion', (t) =>
  t.field({
    type: InterviewQuestionRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateInterviewQuestionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { interviewQuestionResolver } = ctx.diScope.cradle;
      return interviewQuestionResolver.updateInterviewQuestion(ctx.user.sub, args.id, {
        question: args.input.question ?? undefined,
        // Omitted leaves the answer alone; an explicit null clears it.
        answer: args.input.answer,
      });
    },
  }),
);

builder.mutationField('deleteInterviewQuestion', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { interviewQuestionResolver } = ctx.diScope.cradle;
      return interviewQuestionResolver.deleteInterviewQuestion(ctx.user.sub, args.id);
    },
  }),
);

builder.mutationField('reorderInterviewQuestions', (t) =>
  t.field({
    type: [InterviewQuestionRef],
    args: {
      interviewRoundId: t.arg.id({ required: true }),
      orderedIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { interviewQuestionResolver } = ctx.diScope.cradle;
      return interviewQuestionResolver.reorderInterviewQuestions(
        ctx.user.sub,
        args.interviewRoundId,
        args.orderedIds.map(String),
      );
    },
  }),
);
