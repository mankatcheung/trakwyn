/**
 * The user's own (BYOK) LLM provider keys.
 *
 * One of the per-concern modules split out of the former 498-line
 * `userMutations.ts` (JEF-255); `userMutations.ts` still registers them all.
 */

import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { GraphQLError } from 'graphql';
import { TestLlmApiKeyResultRef } from '#src/http/schema/types/TestLlmApiKeyResultType.js';
import { builder } from '#src/http/schema/builder.js';
import { fromCodedError } from '#src/http/errors/AppError.js';

builder.mutationField('saveLlmApiKey', (t) =>
  t.boolean({
    args: {
      provider: t.arg.string({ required: true }),
      apiKey: t.arg.string({ required: true }),
      model: t.arg.string({ required: false }),
      baseUrl: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.saveLlmApiKey(
          ctx.user.sub,
          args.provider,
          args.apiKey,
          args.model,
          args.baseUrl,
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('deleteLlmApiKey', (t) =>
  t.boolean({
    args: {
      provider: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.deleteLlmApiKey(ctx.user.sub, args.provider);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('setDefaultLlmProvider', (t) =>
  t.boolean({
    args: {
      provider: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.setDefaultLlmProvider(ctx.user.sub, args.provider);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('setAiSource', (t) =>
  t.boolean({
    description: "Which key AI calls run on: 'auto', 'trakwyn' or 'own' (JEF-446).",
    args: {
      aiSource: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.setAiSource(ctx.user.sub, args.aiSource);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('testLlmApiKey', (t) =>
  t.field({
    type: TestLlmApiKeyResultRef,
    args: {
      provider: t.arg.string({ required: true }),
      apiKey: t.arg.string({ required: false }),
      model: t.arg.string({ required: false }),
      baseUrl: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        return await userResolver.testLlmApiKey(
          ctx.user.sub,
          args.provider,
          args.apiKey,
          args.model,
          args.baseUrl,
        );
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('setLlmApiKeyMonthlyLimit', (t) =>
  t.boolean({
    args: {
      provider: t.arg.string({ required: true }),
      /** Omit (or pass null) to clear the limit. */
      monthlyTokenLimit: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.setLlmApiKeyMonthlyLimit(
          ctx.user.sub,
          args.provider,
          args.monthlyTokenLimit ?? null,
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
