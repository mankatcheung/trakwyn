import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { getAuth } from '../lib/storage';
import { loginWithOAuth, redeemOAuthRedirect, refreshToken } from '../lib/api';
import { OAuthCancelledError } from '../lib/oauth';
import { reportOAuthFailure } from '../lib/oauthReporting';
import { registerTabOAuthListeners } from '../lib/tabOAuth';
import { initObservability } from '../lib/observability/report';
import {
  EXTENSION_CONTEXTS,
  REFRESH_LEEWAY_MS,
  RUNTIME_MESSAGES,
  type OAuthProvider,
} from '../constants';

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
    reportOAuthFailure(err, provider);
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : 'Sign-in failed',
    };
  }
}

/**
 * A Safari tab sign-in that outlived the background instance that started it
 * (JEF-386). Nobody is waiting for the answer: the popup closed when the tab
 * opened, and the next popup reads the stored session.
 */
async function finishOrphanedTabLogin(redirectUrl: string, verifier: string): Promise<void> {
  try {
    await redeemOAuthRedirect(redirectUrl, verifier);
    await scheduleRefresh();
  } catch (err) {
    // The next popup shows the sign-in screen, which is all the user sees of
    // a failure here. The provider was only known to the lost background.
    reportOAuthFailure(err);
  }
}

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

export default defineBackground(() => {
  initObservability(EXTENSION_CONTEXTS.BACKGROUND);

  // Registered synchronously so a restarted background still receives them.
  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === RUNTIME_MESSAGES.OAUTH_LOGIN) return handleOAuthLogin(message.provider);
    if (message.type === RUNTIME_MESSAGES.REFRESH_TOKEN) return refreshToken();
    return undefined;
  });
  registerTabOAuthListeners(finishOrphanedTabLogin);

  void scheduleRefresh();
});
