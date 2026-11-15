import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { AwardRef } from '#src/http/schema/types/AwardType.js';
import { CreateAwardInput, UpdateAwardInput } from '#src/http/schema/types/inputs/AwardInputs.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createAward', (t) =>
  t.field({
    type: AwardRef,
    args: {
      input: t.arg({ type: CreateAwardInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { awardResolver } = ctx.diScope.cradle;
      return awardResolver.createAward(ctx.user.sub, {
        title: args.input.title,
        issuer: args.input.issuer ?? undefined,
        date: args.input.date ?? undefined,
        description: args.input.description ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateAward', (t) =>
  t.field({
    type: AwardRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateAwardInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { awardResolver } = ctx.diScope.cradle;
      return awardResolver.updateAward(ctx.user.sub, args.id, {
        title: args.input.title ?? undefined,
        issuer: args.input.issuer,
        date: args.input.date,
        description: args.input.description,
      });
    },
  }),
);

builder.mutationField('deleteAward', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { awardResolver } = ctx.diScope.cradle;
      await awardResolver.deleteAward(ctx.user.sub, args.id);
      return true;
    },
  }),
);
