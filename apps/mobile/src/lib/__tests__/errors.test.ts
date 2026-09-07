import '../../i18n';
import { getErrorCode, getErrorMessage, getNetworkMessage } from '../errors';

const gqlError = (message?: string, code?: string) => ({
  response: { errors: [{ message, extensions: code ? { code } : undefined }] },
});

describe('getErrorMessage', () => {
  it("uses the GraphQL error's own message", () => {
    expect(getErrorMessage(gqlError('Invalid credentials'))).toBe('Invalid credentials');
  });

  it('falls back to the generic message for a GraphQL error without one', () => {
    expect(getErrorMessage({ response: { errors: [] } })).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('reports a TypeError as a connectivity problem, the way fetch fails offline', () => {
    expect(getErrorMessage(new TypeError('Network request failed'))).toBe(getNetworkMessage());
  });

  it('never leaks an arbitrary error message', () => {
    expect(getErrorMessage(new Error('ECONNRESET at 10.0.0.4'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('getErrorCode', () => {
  it("returns the API's error code", () => {
    expect(getErrorCode(gqlError('Verify again', 'STEP_UP_REQUIRED'))).toBe('STEP_UP_REQUIRED');
  });

  it('returns null for a GraphQL error without a code', () => {
    expect(getErrorCode(gqlError('oops'))).toBeNull();
  });

  it('returns null for anything that is not a GraphQL error', () => {
    expect(getErrorCode(new Error('boom'))).toBeNull();
    expect(getErrorCode(undefined)).toBeNull();
  });
});
