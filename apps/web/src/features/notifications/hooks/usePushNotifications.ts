import { useCallback, useState, useEffect } from 'react';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';

const REGISTER_PUSH = `
  mutation RegisterPushSubscription($endpoint: String!, $p256dh: String!, $auth: String!) {
    registerPushSubscription(endpoint: $endpoint, p256dh: $p256dh, auth: $auth)
  }
`;

const UNREGISTER_PUSH = `
  mutation UnregisterPushSubscription($endpoint: String!) {
    unregisterPushSubscription(endpoint: $endpoint)
  }
`;

interface PushState {
  /** Whether the browser supports the Push API. */
  isSupported: boolean;
  /** Whether the user has granted notification permission. */
  isPermissionGranted: boolean;
  /** Whether the user has denied notification permission. */
  isPermissionDenied: boolean;
  /** The current push subscription (if enabled). */
  subscription: PushSubscription | null;
  /** Whether we're in the middle of enabling/disabling. */
  isBusy: boolean;
  /** Why the last attempt to enable failed, when the API said (e.g. the device cap). */
  error: string | null;
}

/**
 * Manages the browser push notification lifecycle:
 * permission request, subscription creation, and API registration.
 */
export function usePushNotifications(): PushState & {
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>({
    isSupported: 'serviceWorker' in navigator && 'PushManager' in window,
    isPermissionGranted: 'Notification' in window && Notification.permission === 'granted',
    isPermissionDenied: 'Notification' in window && Notification.permission === 'denied',
    subscription: null,
    isBusy: false,
    error: null,
  });

  // On mount, check for existing subscription
  useEffect(() => {
    if (!state.isSupported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          setState((prev) => ({ ...prev, subscription: sub }));
        }
      })
      .catch(() => {
        // Ignore — the user may not have a subscription yet
      });
  }, [state.isSupported]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported || state.isBusy) return false;

    setState((prev) => ({ ...prev, isBusy: true, error: null }));

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((prev) => ({
          ...prev,
          isPermissionGranted: false,
          isPermissionDenied: permission === 'denied',
          isBusy: false,
        }));
        return false;
      }

      // Get VAPID public key from the server
      const vapidResp = await fetch('/vapid-public-key');
      if (!vapidResp.ok) {
        setState((prev) => ({ ...prev, isBusy: false }));
        return false;
      }
      const { publicKey } = (await vapidResp.json()) as { publicKey: string };
      if (!publicKey) {
        setState((prev) => ({ ...prev, isBusy: false }));
        return false;
      }

      // Convert base64 VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Create push subscription
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Register with the API
      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        await subscription.unsubscribe();
        setState((prev) => ({ ...prev, isBusy: false }));
        return false;
      }

      await gqlClient.request(REGISTER_PUSH, {
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      });

      setState((prev) => ({
        ...prev,
        isPermissionGranted: true,
        isPermissionDenied: false,
        subscription,
        isBusy: false,
      }));
      return true;
    } catch (err) {
      // The API's own message, so a device cap names its limit (JEF-494).
      setState((prev) => ({ ...prev, isBusy: false, error: getErrorMessage(err) }));
      return false;
    }
  }, [state.isSupported, state.isBusy]);

  const disable = useCallback(async () => {
    if (state.isBusy) return;

    setState((prev) => ({ ...prev, isBusy: true }));

    try {
      if (state.subscription) {
        const subJson = state.subscription.toJSON();
        if (subJson.endpoint) {
          await gqlClient.request(UNREGISTER_PUSH, { endpoint: subJson.endpoint });
        }
        await state.subscription.unsubscribe();
      }
    } catch {
      // Best-effort unregistration
    }

    setState((prev) => ({
      ...prev,
      subscription: null,
      isPermissionGranted: false,
      isBusy: false,
    }));
  }, [state.subscription, state.isBusy]);

  return { ...state, enable, disable };
}

/**
 * Converts a base64 VAPID public key to a Uint8Array for pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
