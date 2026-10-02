import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportOAuthFailure } from './oauthReporting';
import { ApiError } from './api';
import { OAuthCancelledError, OAuthFailedError } from './oauth';
import { captureEvent, captureException, markReported } from './observability/report';
import { OBSERVABILITY_EVENTS } from '../constants';

vi.mock('./observability/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./observability/report')>()),
  captureEvent: vi.fn(async () => undefined),
  captureException: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.mocked(captureEvent).mockClear();
  vi.mocked(captureException).mockClear();
});

describe('reportOAuthFailure', () => {
  it('reports nothing when the user cancelled', () => {
    reportOAuthFailure(new OAuthCancelledError(), 'google');

    expect(captureEvent).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports the API's error slug with the provider", () => {
    reportOAuthFailure(new OAuthFailedError('email_in_use'), 'github');

    expect(captureEvent).toHaveBeenCalledExactlyOnceWith(OBSERVABILITY_EVENTS.OAUTH_LOGIN_FAILED, {
      reason: 'email_in_use',
      provider: 'github',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a refused handoff code with the API code', () => {
    reportOAuthFailure(new ApiError('Invalid code', 'VALIDATION'), 'google');

    expect(captureEvent).toHaveBeenCalledExactlyOnceWith(OBSERVABILITY_EVENTS.OAUTH_LOGIN_FAILED, {
      reason: 'exchange_rejected',
      provider: 'google',
      code: 'VALIDATION',
    });
  });

  it('reports an unreachable API as a transport failure', () => {
    const failure = new TypeError('Failed to fetch');
    markReported(failure);

    reportOAuthFailure(failure, 'google');

    expect(captureEvent).toHaveBeenCalledExactlyOnceWith(OBSERVABILITY_EVENTS.OAUTH_LOGIN_FAILED, {
      reason: 'transport',
      provider: 'google',
    });
  });

  it('sends anything else to Error Tracking with its stack', () => {
    const bug = new Error("Couldn't open the sign-in window.");

    reportOAuthFailure(bug, 'google');

    expect(captureException).toHaveBeenCalledExactlyOnceWith(bug, {
      action: 'oauth_login',
      provider: 'google',
    });
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('works without a provider, for a login a restarted background finished', () => {
    reportOAuthFailure(new OAuthFailedError('invalid_state'));

    expect(captureEvent).toHaveBeenCalledExactlyOnceWith(OBSERVABILITY_EVENTS.OAUTH_LOGIN_FAILED, {
      reason: 'invalid_state',
    });
  });
});
