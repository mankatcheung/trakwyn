import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { BillingStatusRef } from '#src/http/schema/types/BillingStatusType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('billingStatus', (t) =>
  t.field({
    type: BillingStatusRef,
    description: "Where the signed-in user stands against their plan's limits.",
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getBillingStatusUseCase } = ctx.diScope.cradle;
      return getBillingStatusUseCase.execute({ userId: ctx.user.sub });
    },
  }),
);
