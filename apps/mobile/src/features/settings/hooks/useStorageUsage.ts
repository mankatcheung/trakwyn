import { useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { STORAGE_USAGE_QUERY } from '../graphql/operations';
import type { StorageUsage } from '../types';

export const storageUsageQueryKey = ['storageUsage'] as const;

/** The signed-in user's document storage, or null while loading or when the API sends none. */
export function useStorageUsage(): StorageUsage | null {
  const { data } = useQuery({
    queryKey: storageUsageQueryKey,
    queryFn: () =>
      gqlRequest<{ me: { storageUsedBytes: number; storageLimitBytes: number } | null }>(
        STORAGE_USAGE_QUERY,
      ),
  });
  const me = data?.me;
  if (!me || typeof me.storageUsedBytes !== 'number' || typeof me.storageLimitBytes !== 'number') {
    return null;
  }
  return { usedBytes: me.storageUsedBytes, limitBytes: me.storageLimitBytes };
}
