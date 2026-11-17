import { describe, expect, it } from 'vitest';
import { shouldRetryQuery } from '#/lib/queryClient';

const gqlError = (code: string) => ({
  response: { errors: [{ message: 'x', extensions: { code } }] },
});

describe('shouldRetryQuery', () => {
  it('retries a failed query once, as the client always did', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError('Failed to fetch'))).toBe(false);
  });

  it('never retries a feature the plan does not include, since asking again cannot change the answer', () => {
    expect(shouldRetryQuery(0, gqlError('PLAN_REQUIRED'))).toBe(false);
  });

  it('retries other coded errors like any other failure', () => {
    expect(shouldRetryQuery(0, gqlError('INTERNAL_ERROR'))).toBe(true);
  });
});
