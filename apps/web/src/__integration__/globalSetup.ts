import { bootApi } from './support/apiProcess';

/**
 * Boots apps/api for the integration tier and returns its teardown, which
 * Vitest runs after the last file, also when a test failed. Teardown stops only
 * a server this run started (see `bootApi`).
 */
export default async function setup(): Promise<() => void> {
  const api = await bootApi();
  return () => api.stop();
}
