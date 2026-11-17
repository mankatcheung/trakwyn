import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

const UPDATE_MUTATION = `
  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) { id }
  }
`;

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
      run(ids, (id) => gqlClient.request(UPDATE_MUTATION, { id, input: { status } })),
    bulkSetStarred: (ids: string[], starred: boolean) =>
      run(ids, (id) => gqlClient.request(UPDATE_MUTATION, { id, input: { starred } })),
    bulkAddTag: (ids: string[], tag: string, apps: ApplicationTags[]) => {
      const byId = new Map(apps.map((a) => [a.id, a]));
      return run(ids, (id) => {
        const existing = byId.get(id)?.tags ?? [];
        const tags = existing.includes(tag) ? existing : [...existing, tag];
        return gqlClient.request(UPDATE_MUTATION, { id, input: { tags } });
      });
    },
  };
}
