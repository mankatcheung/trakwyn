import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { OfferRef, OfferWithApplicationRef } from '#src/http/schema/types/OfferType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('offers', (t) =>
  t.field({
    type: [OfferRef],
    args: {
      applicationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const resolver = ctx.diScope.cradle.offerResolver;
      return resolver.getOffers(ctx.user.sub, args.applicationId);
    },
  }),
);

builder.queryField('myOffers', (t) =>
  t.field({
    type: [OfferWithApplicationRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const resolver = ctx.diScope.cradle.offerResolver;
      return resolver.getAllOffers(ctx.user.sub);
    },
  }),
);
