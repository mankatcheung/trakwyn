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
