import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { getAuth, getPersistedRefreshToken } from '../lib/storage';
import { loginWithOAuth, redeemOAuthRedirect, refreshToken } from '../lib/api';
import { OAuthCancelledError } from '../lib/oauth';
import { reportOAuthFailure } from '../lib/oauthReporting';
import { hasPendingTabOAuth, registerTabOAuthListeners } from '../lib/tabOAuth';
import { initObservability } from '../lib/observability/report';
import { createUpdateReloader, registerUpdateReload } from '../lib/updateReload';
import {
  EXTENSION_CONTEXTS,
  REFRESH_LEEWAY_MS,
  RUNTIME_MESSAGES,
  type OAuthProvider,
} from '../constants';

/** What the popup gets back from an OAUTH_LOGIN message. */
export type OAuthLoginResponse = { ok: true } | { ok: false; cancelled: boolean; error?: string };

type RuntimeMessage =
  | {
      type: typeof RUNTIME_MESSAGES.OAUTH_LOGIN;
      provider: OAuthProvider;
      keepSignedIn?: boolean;
    }
  | { type: typeof RUNTIME_MESSAGES.REFRESH_TOKEN };

/**
 * Applies a downloaded update once nothing is in flight (JEF-455). Every
 * sign-in and refresh below runs through `reloader.track`, since a reload
 * empties storage.session and could lose a refresh token the API just rotated.
 */
const reloader = createUpdateReloader({
  reload: () => browser.runtime.reload(),
  hasPendingTabLogin: hasPendingTabOAuth,
});

async function handleOAuthLogin(
  provider: OAuthProvider,
  keepSignedIn: boolean,
): Promise<OAuthLoginResponse> {
  try {
    await loginWithOAuth(provider, keepSignedIn);
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
async function finishOrphanedTabLogin(
  redirectUrl: string,
  verifier: string,
  keepSignedIn: boolean,
): Promise<void> {
  try {
    await redeemOAuthRedirect(redirectUrl, verifier, keepSignedIn);
    await scheduleRefresh();
  } catch (err) {
    // The next popup shows the sign-in screen, which is all the user sees of
    // a failure here. The provider was only known to the lost background.
    reportOAuthFailure(err);
  }
}

// Proactively refresh the token shortly before it expires
async function scheduleRefresh() {
  let auth = await getAuth();
  // A browser restart clears the session but not a persisted refresh token
  // ("Keep me signed in", JEF-421): refreshing with it restores the session.
  if (!auth && (await getPersistedRefreshToken())) {
    await refreshToken();
    auth = await getAuth();
  }
  if (!auth) return;
  const msUntilRefresh = auth.expiresAt - Date.now() - REFRESH_LEEWAY_MS;
  if (msUntilRefresh <= 0) {
    await refreshToken();
  } else {
    setTimeout(
      () =>
        void reloader.track(async () => {
          await refreshToken();
          await scheduleRefresh();
        }),
      Math.min(msUntilRefresh, 60_000),
    ); // check at most every minute
  }
}

export default defineBackground(() => {
  initObservability(EXTENSION_CONTEXTS.BACKGROUND);

  // Registered synchronously so a restarted background still receives them.
  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === RUNTIME_MESSAGES.OAUTH_LOGIN) {
      return reloader.track(() =>
        handleOAuthLogin(message.provider, message.keepSignedIn === true),
      );
    }
    if (message.type === RUNTIME_MESSAGES.REFRESH_TOKEN) return reloader.track(refreshToken);
    return undefined;
  });
  registerTabOAuthListeners((redirectUrl, verifier, keepSignedIn) =>
    reloader.track(() => finishOrphanedTabLogin(redirectUrl, verifier, keepSignedIn)),
  );
  registerUpdateReload(reloader);

  void reloader.track(scheduleRefresh);
});
