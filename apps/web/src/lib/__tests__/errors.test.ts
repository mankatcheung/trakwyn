import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getErrorMessage } from '#/lib/errors';
import en from '#/i18n/en.json';

function gqlError(code?: string, message?: string) {
  return { response: { errors: [{ message, extensions: code ? { code } : undefined }] } };
}

describe('getErrorMessage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the original error', () => {
    const error = new Error('boom');
    getErrorMessage(error);
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it.each([
    ['USER_NOT_FOUND', en['errors.userNotFound']],
    ['NOT_FOUND', en['errors.itemNotFound']],
    ['FORBIDDEN', en['errors.forbidden']],
  ])('overrides the raw message for %s', (code, expected) => {
    expect(getErrorMessage(gqlError(code, 'raw server text'))).toBe(expected);
  });

  it.each(['CONFLICT', 'VALIDATION', 'RATE_LIMITED', 'UNAUTHORIZED'])(
    'passes the server message through for %s',
    (code) => {
      expect(getErrorMessage(gqlError(code, 'Invalid credentials'))).toBe('Invalid credentials');
    },
  );

  it.each(['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'])(
    'hides the server message behind the generic one for %s',
    (code) => {
      expect(getErrorMessage(gqlError(code, 'stack trace here'))).toBe(en['errors.generic']);
    },
  );

  it('uses the generic message when the GraphQL error has no code', () => {
    expect(getErrorMessage(gqlError(undefined, 'oops'))).toBe(en['errors.generic']);
  });

  it('uses the generic message when the response has no errors', () => {
    expect(getErrorMessage({ response: {} })).toBe(en['errors.generic']);
  });

  it('uses the generic message for a coded error with no message', () => {
    expect(getErrorMessage(gqlError('CONFLICT'))).toBe(en['errors.generic']);
  });

  it('reports a TypeError (a failed fetch) as a network problem', () => {
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toBe(en['errors.network']);
  });

  it.each([new Error('x'), 'a string', null, undefined, 42])(
    'uses the generic message for %j',
    (error) => {
      expect(getErrorMessage(error)).toBe(en['errors.generic']);
    },
  );
});
