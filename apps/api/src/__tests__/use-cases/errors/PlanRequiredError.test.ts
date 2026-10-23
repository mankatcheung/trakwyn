import { describe, expect, it } from 'vitest';
import { PlanRequiredError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { fromCodedError } from '#src/http/errors/AppError.js';

describe('PlanRequiredError', () => {
  it('carries the PLAN_REQUIRED code', () => {
    expect(new PlanRequiredError('Pro only').code).toBe(ERROR_CODES.PLAN_REQUIRED);
  });

  it('has a readable default message', () => {
    expect(new PlanRequiredError().message).toMatch(/Pro/);
  });

  it('is reported to the client as a 403 with its own code', () => {
    const appError = fromCodedError(new PlanRequiredError('Analytics is a Pro feature'));

    expect(appError.statusCode).toBe(403);
    expect(appError.code).toBe(ERROR_CODES.PLAN_REQUIRED);
    expect(appError.message).toBe('Analytics is a Pro feature');
  });
});
