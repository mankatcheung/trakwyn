/** `ok` below 80% of the limit (nothing is shown), `warning` from 80%, `full` once nothing more can be added. */
export type QuotaLevel = 'ok' | 'warning' | 'full';

const WARNING_FRACTION = 0.8;

export function quotaLevel(used: number, limit: number): QuotaLevel {
  if (used >= limit) return 'full';
  return used >= limit * WARNING_FRACTION ? 'warning' : 'ok';
}
