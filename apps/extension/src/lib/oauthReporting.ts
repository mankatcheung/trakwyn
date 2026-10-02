import { ApiError } from './api';
import { OAuthCancelledError, OAuthFailedError } from './oauth';
import { captureEvent, captureException, wasReported } from './observability/report';
import { OBSERVABILITY_EVENTS, type OAuthProvider } from '../constants';

/**
 * Reports a sign-in that failed (JEF-387); a cancel is not one. The failures
 * with a known cause are an event carrying only the provider and the cause:
 * the API's error slug, the API refusing the handoff code, or the API being
 * unreachable (which `gql` reported too, with the trace id). Anything else is
 * a bug, so it goes to Error Tracking with its stack.
 */
export function reportOAuthFailure(err: unknown, provider?: OAuthProvider): void {
  if (err instanceof OAuthCancelledError) return;
  const reason = oauthFailureReason(err);
  if (!reason) {
    void captureException(err, { action: 'oauth_login', ...(provider ? { provider } : {}) });
    return;
  }
  void captureEvent(OBSERVABILITY_EVENTS.OAUTH_LOGIN_FAILED, {
    reason,
    ...(provider ? { provider } : {}),
    ...(err instanceof ApiError && err.code ? { code: err.code } : {}),
  });
}

function oauthFailureReason(err: unknown): string | null {
  if (err instanceof OAuthFailedError) return err.slug;
  if (wasReported(err)) return 'transport';
  if (err instanceof ApiError) return 'exchange_rejected';
  return null;
}
