import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { BULK_UPDATE_APPLICATION } from '../graphql/applicationMutations';

interface ApplicationTags {
  id: string;
  tags: string[];
}

export function useBulkActions() {
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const run = async (ids: string[], fn: (id: string) => Promise<unknown>) => {
    setIsPending(true);
    try {
      await Promise.all(ids.map(fn));
    } finally {
      setIsPending(false);
      await qc.invalidateQueries({ queryKey: ['applications'] });
    }
  };

  return {
    isPending,
    bulkUpdateStatus: (ids: string[], status: ApplicationStatus) =>
      run(ids, (id) => gqlClient.request(BULK_UPDATE_APPLICATION, { id, input: { status } })),
    bulkSetStarred: (ids: string[], starred: boolean) =>
      run(ids, (id) => gqlClient.request(BULK_UPDATE_APPLICATION, { id, input: { starred } })),
    bulkAddTag: (ids: string[], tag: string, apps: ApplicationTags[]) => {
      const byId = new Map(apps.map((a) => [a.id, a]));
      return run(ids, (id) => {
        const existing = byId.get(id)?.tags ?? [];
        const tags = existing.includes(tag) ? existing : [...existing, tag];
        return gqlClient.request(BULK_UPDATE_APPLICATION, { id, input: { tags } });
      });
    },
  };
}
