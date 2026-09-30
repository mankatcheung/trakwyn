import { getAuth } from '../lib/storage';
import { loginWithOAuth, refreshToken } from '../lib/api';
import { OAuthCancelledError } from '../lib/oauth';
import { REFRESH_LEEWAY_MS, RUNTIME_MESSAGES, type OAuthProvider } from '../constants';

/** What the popup gets back from an OAUTH_LOGIN message. */
export type OAuthLoginResponse = { ok: true } | { ok: false; cancelled: boolean; error?: string };

type RuntimeMessage =
  | { type: typeof RUNTIME_MESSAGES.OAUTH_LOGIN; provider: OAuthProvider }
  | { type: typeof RUNTIME_MESSAGES.REFRESH_TOKEN };

async function handleOAuthLogin(provider: OAuthProvider): Promise<OAuthLoginResponse> {
  try {
    await loginWithOAuth(provider);
    await scheduleRefresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof OAuthCancelledError) return { ok: false, cancelled: true };
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : 'Sign-in failed',
    };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === RUNTIME_MESSAGES.OAUTH_LOGIN) {
    handleOAuthLogin(message.provider).then(sendResponse);
    return true; // keep the channel open for the async response
  }
  if (message.type === RUNTIME_MESSAGES.REFRESH_TOKEN) {
    refreshToken().then(sendResponse);
    return true;
  }
  return false;
});

// Proactively refresh the token shortly before it expires
async function scheduleRefresh() {
  const auth = await getAuth();
  if (!auth) return;
  const msUntilRefresh = auth.expiresAt - Date.now() - REFRESH_LEEWAY_MS;
  if (msUntilRefresh <= 0) {
    await refreshToken();
  } else {
    setTimeout(
      async () => {
        await refreshToken();
        await scheduleRefresh();
      },
      Math.min(msUntilRefresh, 60_000),
    ); // check at most every minute
  }
}

scheduleRefresh();
