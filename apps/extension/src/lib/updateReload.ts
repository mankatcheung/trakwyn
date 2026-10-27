import { browser } from 'wxt/browser';
import { RUNTIME_PORTS, UPDATE_RELOAD_RETRY_MS } from '../constants';

/**
 * Applies a downloaded update as soon as the Clipper is idle (JEF-455).
 *
 * Once `runtime.onUpdateAvailable` has a listener, the browser holds the new
 * version until the extension reloads or the browser restarts, so this reloads
 * it. A reload empties `storage.session` and closes the popup, so it waits
 * until nothing would be lost:
 * - no popup is open (an edited clip would go with it);
 * - no sign-in or token refresh is in flight. Mid-refresh the API has already
 *   rotated the refresh token, so losing the new one makes the next refresh
 *   look like reuse, and the API revokes the session;
 * - no tab sign-in is pending in `storage.session` (one a restarted background
 *   is still waiting to finish, `tabOAuth.ts`).
 *
 * It checks again when a popup closes, when tracked work finishes, and every
 * `UPDATE_RELOAD_RETRY_MS`. If the background is unloaded while it waits, the
 * browser applies the update itself when the extension next starts.
 */
export interface UpdateReloader {
  /** A new version has been downloaded. */
  updateAvailable(): void;
  popupOpened(): void;
  popupClosed(): void;
  /** Runs `work`, holding any reload until it settles. */
  track<T>(work: () => Promise<T>): Promise<T>;
}

export interface UpdateReloaderDeps {
  reload: () => void;
  /** A tab sign-in kept in `storage.session` (`hasPendingTabOAuth`). */
  hasPendingTabLogin: () => Promise<boolean>;
}

export function createUpdateReloader(deps: UpdateReloaderDeps): UpdateReloader {
  let updatePending = false;
  let reloaded = false;
  let inFlight = 0;
  let popups = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const isBusy = (): boolean => inFlight > 0 || popups > 0;

  function scheduleRetry(): void {
    if (retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      void tryReload();
    }, UPDATE_RELOAD_RETRY_MS);
  }

  async function tryReload(): Promise<void> {
    if (!updatePending || reloaded) return;
    if (isBusy()) return scheduleRetry();
    let tabLoginPending: boolean;
    try {
      tabLoginPending = await deps.hasPendingTabLogin();
    } catch {
      // Not knowing is not idle; look again later.
      tabLoginPending = true;
    }
    // A popup or a refresh may have started during the read.
    if (tabLoginPending || isBusy()) return scheduleRetry();
    if (reloaded) return;
    reloaded = true;
    if (retry !== undefined) clearTimeout(retry);
    deps.reload();
  }

  return {
    updateAvailable() {
      updatePending = true;
      void tryReload();
    },
    popupOpened() {
      popups += 1;
    },
    popupClosed() {
      popups = Math.max(0, popups - 1);
      void tryReload();
    },
    async track(work) {
      inFlight += 1;
      try {
        return await work();
      } finally {
        inFlight -= 1;
        void tryReload();
      }
    },
  };
}

/**
 * Wires the reloader to the browser: the update event, and the popup's port
 * (`connectPopupPort`), which disconnects by itself when the popup closes.
 * Registered synchronously when the background starts, like the other
 * listeners, so a restarted background still receives the event.
 */
export function registerUpdateReload(reloader: UpdateReloader): void {
  browser.runtime.onUpdateAvailable.addListener(() => reloader.updateAvailable());
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== RUNTIME_PORTS.POPUP) return;
    reloader.popupOpened();
    port.onDisconnect.addListener(() => reloader.popupClosed());
  });
}

/**
 * Called once by the popup: holds a port open to the background for as long as
 * the popup is showing. If the background restarts under it, the port drops
 * and is opened again on the next tick, so the new background knows the popup
 * is still there. Not after the extension itself is gone (`runtime.id` unset),
 * which would otherwise reconnect in a loop.
 */
export function connectPopupPort(): void {
  const port = browser.runtime.connect({ name: RUNTIME_PORTS.POPUP });
  port.onDisconnect.addListener(() => {
    setTimeout(() => {
      if (browser.runtime?.id) connectPopupPort();
    }, 0);
  });
}
