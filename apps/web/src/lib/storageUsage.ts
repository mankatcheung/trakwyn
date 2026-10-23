import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const STORAGE_USAGE_QUERY = `
  query StorageUsage {
    me { storageUsedBytes storageLimitBytes }
  }
`;

export const storageUsageQueryKey = ['storageUsage'] as const;

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
}

/** `ok` below 80% of the limit, `warning` from 80%, `full` once nothing more fits. */
export type StorageLevel = 'ok' | 'warning' | 'full';

const WARNING_FRACTION = 0.8;
const BYTES_PER_MB = 1024 * 1024;

export function storageLevel({ usedBytes, limitBytes }: StorageUsage): StorageLevel {
  if (usedBytes >= limitBytes) return 'full';
  return usedBytes >= limitBytes * WARNING_FRACTION ? 'warning' : 'ok';
}

/** Share of the limit used, 0–100. Reads 100 only once the account is full, never from rounding. */
export function storagePercent(usage: StorageUsage): number {
  if (storageLevel(usage) === 'full') return 100;
  return Math.min(99, Math.round((usage.usedBytes / usage.limitBytes) * 100));
}

export function storageLeftBytes({ usedBytes, limitBytes }: StorageUsage): number {
  return Math.max(0, limitBytes - usedBytes);
}

/** Megabytes with one decimal at most, e.g. `12.5 MB`, `100 MB`. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / BYTES_PER_MB) * 10) / 10} MB`;
}

/** The signed-in user's document storage, or null while loading or when the API sends none. */
export function useStorageUsage(): StorageUsage | null {
  const { data } = useQuery({
    queryKey: storageUsageQueryKey,
    queryFn: () =>
      gqlClient.request<{
        me: { storageUsedBytes: number; storageLimitBytes: number } | null;
      }>(STORAGE_USAGE_QUERY),
  });
  const me = data?.me;
  if (!me || typeof me.storageUsedBytes !== 'number' || typeof me.storageLimitBytes !== 'number') {
    return null;
  }
  return { usedBytes: me.storageUsedBytes, limitBytes: me.storageLimitBytes };
}
