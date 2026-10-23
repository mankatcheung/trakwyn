import type { StorageUsage } from '../types';

/** `ok` below 80% of the limit, `warning` from 80%, `full` once nothing more fits. */
export type StorageLevel = 'ok' | 'warning' | 'full';

const WARNING_FRACTION = 0.8;
const BYTES_PER_MB = 1024 * 1024;

export function storageLevel({ usedBytes, limitBytes }: StorageUsage): StorageLevel {
  if (usedBytes >= limitBytes) return 'full';
  return usedBytes >= limitBytes * WARNING_FRACTION ? 'warning' : 'ok';
}

/** Megabytes with one decimal at most, e.g. `12.5 MB`, `100 MB`. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
}

/** Share of the limit used, 0–100. Reads 100 only once the account is full, never from rounding. */
export function storagePercent(usage: StorageUsage): number {
  if (usage.limitBytes <= 0 || storageLevel(usage) === 'full') return 100;
  return Math.min(99, Math.round((usage.usedBytes / usage.limitBytes) * 100));
}
