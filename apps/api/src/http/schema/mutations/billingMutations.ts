import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CheckoutPlanEnum } from '#src/http/schema/types/enums/PlanEnums.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const BillingRedirectRef = builder.objectRef<{ url: string }>('BillingRedirect');
BillingRedirectRef.implement({
  description:
    'A page at the payment provider to send the browser to (JEF-426). Use it once; it expires.',
  fields: (t) => ({ url: t.exposeString('url') }),
});

builder.mutationField('createCheckoutSession', (t) =>
  t.field({
    type: BillingRedirectRef,
    description:
      'Starts a purchase of Pro. Refuses an active subscriber, who would pay twice for the same time.',
    args: { plan: t.arg({ type: CheckoutPlanEnum, required: true }) },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { createCheckoutSessionUseCase } = ctx.diScope.cradle;
      return createCheckoutSessionUseCase.execute({ userId: ctx.user.sub, plan: args.plan });
    },
  }),
);

builder.mutationField('createBillingPortalSession', (t) =>
  t.field({
    type: BillingRedirectRef,
    description:
      "Opens the payment provider's page to manage or cancel. Fails until the user has paid once.",
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { createBillingPortalSessionUseCase } = ctx.diScope.cradle;
      return createBillingPortalSessionUseCase.execute({ userId: ctx.user.sub });
    },
  }),
);
