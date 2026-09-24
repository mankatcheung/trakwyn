import { useEffect } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { addBreadcrumb, rememberNetworkConnected } from '../lib/analytics';

/**
 * Records connectivity changes as breadcrumbs attached to the next exception
 * (JEF-367). Renders nothing.
 *
 * Most "the app is broken" reports from a phone are really "the network was
 * bad", and without this nothing in the trail says so.
 *
 * **Three fields only:** whether the device has a connection, whether the
 * internet is reachable through it (false on a captive portal, null while
 * NetInfo is still finding out), and the connection type (`wifi`,
 * `cellular`, `none`…). NetInfo's `details` — SSID, BSSID, IP address,
 * subnet, carrier — is never read, so it cannot reach a breadcrumb.
 *
 * NetInfo reports the current state on subscribe and again on anything it
 * notices, including detail-only changes (signal strength, a new IP on the
 * same network). Those would crowd the informative entries out of the
 * buffer, so a report is recorded only when one of the three fields moved.
 */
export function NetworkBreadcrumbs() {
  useEffect(() => {
    let last: string | null = null;

    return NetInfo.addEventListener((state: NetInfoState) => {
      const summary = {
        connected: state.isConnected,
        reachable: state.isInternetReachable,
        type: state.type,
      };
      const key = JSON.stringify(summary);
      if (key === last) return;
      last = key;

      rememberNetworkConnected(state.isConnected);
      addBreadcrumb('Network changed', summary);
    });
  }, []);

  return null;
}
