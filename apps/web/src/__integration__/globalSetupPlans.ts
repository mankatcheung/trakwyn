import { bootApi, PLANS_API } from './support/apiProcess';

/**
 * Boots the second API, with `PLANS_ENFORCED=true`, for the `integration-plans`
 * project (JEF-667). Same teardown rules as `globalSetup.ts`.
 */
export default async function setup(): Promise<() => void> {
  const api = await bootApi(PLANS_API);
  return () => api.stop();
}
