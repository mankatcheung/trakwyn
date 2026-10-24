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

  describe('PLAN_REQUIRED (JEF-344)', () => {
    it('keeps what the API said and tells the user where to manage their plan', () => {
      expect(getErrorMessage(gqlError('Analytics is a Pro feature', 'PLAN_REQUIRED'))).toBe(
        'Analytics is a Pro feature. Manage your plan on the web.',
      );
    });

    it('does not double the full stop when the API message already ends with one', () => {
      expect(
        getErrorMessage(
          gqlError(
            'The Free plan includes 5 AI actions a month. Upgrade to Pro for unlimited AI.',
            'PLAN_REQUIRED',
          ),
        ),
      ).toBe(
        'The Free plan includes 5 AI actions a month. Upgrade to Pro for unlimited AI. Manage your plan on the web.',
      );
    });

    it('still says it is a Pro feature when the API sent no message', () => {
      expect(getErrorMessage(gqlError(undefined, 'PLAN_REQUIRED'))).toBe(
        'This is a Pro feature. Manage your plan on the web.',
      );
    });

    it('leaves every other code alone', () => {
      expect(getErrorMessage(gqlError('Too many requests', 'RATE_LIMITED'))).toBe(
        'Too many requests',
      );
    });
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
