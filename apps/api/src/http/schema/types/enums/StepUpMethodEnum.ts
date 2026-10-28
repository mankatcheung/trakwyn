import { builder } from '#src/http/schema/builder.js';
import type { StepUpMethod } from '#src/use-cases/auth/GetStepUpMethodsUseCase.js';

const STEP_UP_METHODS = [
  'password',
  'google',
  'github',
  'email_code',
] as const satisfies readonly StepUpMethod[];

/**
 * How a signed-in user can confirm it is them (JEF-463). A provider name means
 * "sign in again with it"; `email_code` is a code mailed to the account.
 */
export const StepUpMethodEnum = builder.enumType('StepUpMethod', {
  values: Object.fromEntries(STEP_UP_METHODS.map((method) => [method, { value: method }])) as {
    [M in (typeof STEP_UP_METHODS)[number]]: { value: M };
  },
});
