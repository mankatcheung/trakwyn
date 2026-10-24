import { builder } from '#src/http/schema/builder.js';

export const PlanEnum = builder.enumType('Plan', {
  values: {
    free: { value: 'free' },
    pro: { value: 'pro' },
  },
});

export const PlanSourceEnum = builder.enumType('PlanSource', {
  values: {
    subscription: { value: 'subscription' },
    pass: { value: 'pass' },
    trial: { value: 'trial' },
    grant: { value: 'grant' },
  },
});

export const CheckoutPlanEnum = builder.enumType('CheckoutPlan', {
  description: 'What can be bought. The server picks the price, including any founder price.',
  values: {
    monthly: { value: 'monthly' },
    pass3Months: { value: 'pass_3m' },
    pass6Months: { value: 'pass_6m' },
  },
});
