/**
 * The device's last known connectivity (JEF-367), kept here so an exception
 * can say whether it happened offline without the reporting code importing
 * NetInfo itself.
 *
 * `NetworkBreadcrumbs` is the only writer. Until its first report the value
 * is unknown, and an exception then carries no `$network_connected` at all
 * rather than a guess.
 */

let connected: boolean | null = null;

export function rememberNetworkConnected(value: boolean | null): void {
  connected = value;
}

export function getNetworkConnected(): boolean | null {
  return connected;
}

/** Test seam: forgets the last report so each test starts with the network unknown. */
export function resetNetworkState(): void {
  connected = null;
}
